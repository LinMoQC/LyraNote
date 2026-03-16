# LyraNote 文件存储系统设计方案

> 设计日期：2026-03-10  
> 当前状态：本地文件系统（硬编码）  
> 目标：引入 StorageProvider 抽象层，统一支持本地、MinIO、阿里云 OSS、AWS S3

---

## 一、现状诊断

### 1.1 当前架构（全部硬编码）

```
用户上传 PDF
    │
    ▼
source/router.py upload_source()
    │   os.makedirs("./storage/<notebook_id>/")
    │   open(file_path, "wb").write(content)   ← 同步阻塞！
    │
    ▼  sources.file_path = "./storage/nb_id/uuid.pdf"
    │
    ▼ (Celery 任务)
agents/ingestion.py _extract_text()
    │   PdfReader(source.file_path)             ← 直接读本地磁盘
    │   open(source.file_path)
    ▼
pgvector chunks
```

### 1.2 核心问题清单

| 问题 | 具体表现 |
|------|---------|
| 无存储抽象 | `config.py` 中 `storage_backend: Literal["local", "minio"]` 存在但完全未实现 |
| 同步阻塞 I/O | `open(file_path, "wb")` 在 async 路由中执行，阻塞 event loop |
| 绑定本地磁盘 | `sources.file_path` 存绝对路径，Celery worker 必须与 API 进程共享文件系统 |
| 无文件删除 | `DELETE /sources/{id}` 只删 DB 行，本地文件永远不清理 |
| 无文件服务 | 无法向前端提供文件下载/预览 URL |
| 部署限制 | 水平扩展时多个 API 实例无法共享 `./storage/` 目录 |

---

## 二、目标架构

### 2.1 设计原则

1. **Provider 模式**：业务代码只依赖 `StorageProvider` 抽象接口，不感知具体后端
2. **S3 兼容优先**：MinIO、阿里云 OSS、AWS S3、Cloudflare R2 均兼容 S3 API，使用 `aioboto3` 统一处理
3. **抽象存储键**：`storage_key = "notebooks/<nb_id>/<uuid>.pdf"` 作为全局唯一标识，与后端无关
4. **向后兼容**：保留 `sources.file_path`，旧数据继续读取，新数据写入 `storage_key`

### 2.2 总体架构图

```
                    ┌──────────────────────────────────┐
                    │       StorageProvider (ABC)        │
                    │  upload / download / delete / url  │
                    └─────────────┬────────────────────┘
                                  │ implements
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       LocalStorage         S3Storage           OSSStorage
       (aiofiles)           (aioboto3)     (aioboto3 + custom endpoint)
       ./storage/           AWS S3         阿里云OSS / MinIO / R2
```

```
业务层调用：
  source/router.py     → get_storage_provider().upload(key, bytes)
  agents/ingestion.py  → get_storage_provider().download(key) → bytes
  DELETE /sources/{id} → get_storage_provider().delete(key)
  GET /sources/{id}/download → get_storage_provider().get_url(key)
```

---

## 三、数据模型变更

### 3.1 `sources` 表新增字段

```python
# api/app/models.py  Source 类新增：

# 抽象存储键，格式：notebooks/<notebook_id>/<uuid><ext>
# 新上传文件写此字段；旧数据 file_path 保留作回退
storage_key:     Mapped[str | None]  = mapped_column(String(500))

# 记录存储后端，便于未来迁移数据时区分来源
storage_backend: Mapped[str | None]  = mapped_column(String(20))
```

### 3.2 迁移文件

`api/alembic/versions/008_source_storage_key.py`：

```python
def upgrade():
    op.add_column("sources", sa.Column("storage_key",     sa.String(500), nullable=True))
    op.add_column("sources", sa.Column("storage_backend", sa.String(20),  nullable=True))
    op.create_index("ix_sources_storage_key", "sources", ["storage_key"])
```

---

## 四、StorageProvider 接口设计

### 4.1 抽象基类

```python
# api/app/providers/storage.py

class StorageProvider(ABC):

    @abstractmethod
    async def upload(
        self,
        key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """上传文件内容到指定 key。"""

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """下载文件内容，返回 bytes。文件不存在时抛 FileNotFoundError。"""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """删除文件。key 不存在时静默忽略。"""

    @abstractmethod
    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        """
        获取文件访问 URL。
        - 本地后端：返回内部 API 路径  /api/v1/storage/files/<key>
        - 云后端：返回带签名的临时 URL（TTL = expires_in 秒）
        """

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """检查文件是否存在。"""
```

### 4.2 LocalStorage 实现

```python
class LocalStorage(StorageProvider):
    """
    本地文件系统存储，使用 aiofiles 异步读写。
    存储路径：{base_path}/{key}
    """

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)

    def _full_path(self, key: str) -> Path:
        # 防止目录穿越攻击
        resolved = (self.base_path / key).resolve()
        if not str(resolved).startswith(str(self.base_path.resolve())):
            raise ValueError(f"Invalid storage key: {key}")
        return resolved

    async def upload(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        path = self._full_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(content)

    async def download(self, key: str) -> bytes:
        path = self._full_path(key)
        if not path.exists():
            raise FileNotFoundError(f"Storage key not found: {key}")
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def delete(self, key: str) -> None:
        path = self._full_path(key)
        if path.exists():
            path.unlink()

    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        # 返回内部下载端点，由 FastAPI 路由处理鉴权和流式传输
        return f"/api/v1/storage/files/{key}"

    async def exists(self, key: str) -> bool:
        return self._full_path(key).exists()
```

### 4.3 S3Storage 实现（统一覆盖 AWS S3 / MinIO / 阿里云 OSS / R2）

```python
class S3Storage(StorageProvider):
    """
    S3 兼容对象存储。通过 endpoint_url 切换后端：
      - AWS S3:       endpoint_url=None（使用默认）
      - MinIO:        endpoint_url=http://localhost:9000
      - 阿里云 OSS:   endpoint_url=https://oss-cn-hangzhou.aliyuncs.com
      - Cloudflare R2:endpoint_url=https://<account>.r2.cloudflarestorage.com
    """

    def __init__(self, bucket: str, access_key: str, secret_key: str,
                 region: str = "us-east-1", endpoint_url: str | None = None):
        self.bucket = bucket
        self._session_kwargs = dict(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            endpoint_url=endpoint_url,
        )

    @asynccontextmanager
    async def _client(self):
        async with aioboto3.Session().client("s3", **self._session_kwargs) as client:
            yield client

    async def upload(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        async with self._client() as s3:
            await s3.put_object(
                Bucket=self.bucket, Key=key,
                Body=content, ContentType=content_type,
            )

    async def download(self, key: str) -> bytes:
        async with self._client() as s3:
            try:
                resp = await s3.get_object(Bucket=self.bucket, Key=key)
                return await resp["Body"].read()
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(f"Storage key not found: {key}")

    async def delete(self, key: str) -> None:
        async with self._client() as s3:
            await s3.delete_object(Bucket=self.bucket, Key=key)

    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        async with self._client() as s3:
            return await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in,
            )

    async def exists(self, key: str) -> bool:
        async with self._client() as s3:
            try:
                await s3.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:
                return False
```

### 4.4 工厂函数

```python
def get_storage_provider() -> StorageProvider:
    s = settings
    if s.storage_backend == "local":
        return LocalStorage(s.storage_local_path)
    elif s.storage_backend in ("s3", "minio", "oss", "r2"):
        return S3Storage(
            bucket=s.storage_s3_bucket,
            access_key=s.storage_s3_access_key,
            secret_key=s.storage_s3_secret_key,
            region=s.storage_s3_region,
            endpoint_url=s.storage_s3_endpoint_url or None,
        )
    raise ValueError(f"Unknown storage backend: {s.storage_backend}")

# 模块级单例（避免每次请求重新实例化）
_storage_instance: StorageProvider | None = None

def storage() -> StorageProvider:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = get_storage_provider()
    return _storage_instance
```

---

## 五、配置层变更

### 5.1 `config.py` 扩展

```python
# 替换原有 storage_backend + minio_* 配置

storage_backend: Literal["local", "s3", "minio", "oss", "r2"] = "local"
storage_local_path: str = "./storage"

# S3 兼容配置（适用于 s3 / minio / oss / r2 后端）
storage_s3_bucket:       str = "lyranote"
storage_s3_access_key:   str = ""
storage_s3_secret_key:   str = ""
storage_s3_region:       str = "us-east-1"
# MinIO / OSS / R2 填写自定义 endpoint；AWS S3 留空
storage_s3_endpoint_url: str = ""
```

### 5.2 各后端 .env 配置示例

```bash
# ── 本地开发（默认）──────────────────────────────────
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./storage

# ── MinIO（自托管）───────────────────────────────────
STORAGE_BACKEND=minio
STORAGE_S3_ENDPOINT_URL=http://localhost:9000
STORAGE_S3_BUCKET=lyranote
STORAGE_S3_ACCESS_KEY=minioadmin
STORAGE_S3_SECRET_KEY=minioadmin
STORAGE_S3_REGION=us-east-1

# ── 阿里云 OSS ───────────────────────────────────────
STORAGE_BACKEND=oss
STORAGE_S3_ENDPOINT_URL=https://oss-cn-hangzhou.aliyuncs.com
STORAGE_S3_BUCKET=lyranote-prod
STORAGE_S3_ACCESS_KEY=LTAI5xxxxx
STORAGE_S3_SECRET_KEY=xxxxxxxx
STORAGE_S3_REGION=cn-hangzhou

# ── AWS S3 ───────────────────────────────────────────
STORAGE_BACKEND=s3
STORAGE_S3_BUCKET=lyranote-prod
STORAGE_S3_ACCESS_KEY=AKIA...
STORAGE_S3_SECRET_KEY=...
STORAGE_S3_REGION=ap-northeast-1

# ── Cloudflare R2 ────────────────────────────────────
STORAGE_BACKEND=r2
STORAGE_S3_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
STORAGE_S3_BUCKET=lyranote
STORAGE_S3_ACCESS_KEY=...
STORAGE_S3_SECRET_KEY=...
STORAGE_S3_REGION=auto
```

---

## 六、业务层改造

### 6.1 文件上传（`source/router.py`）

```python
# 改造前
storage_dir = os.path.join(settings.storage_local_path, str(notebook_id))
os.makedirs(storage_dir, exist_ok=True)
file_path = os.path.join(storage_dir, f"{file_id}{ext}")
content = await file.read()
with open(file_path, "wb") as f:        # 同步阻塞
    f.write(content)
source.file_path = file_path

# 改造后
from app.providers.storage import storage

content = await file.read()
content_type = file.content_type or "application/octet-stream"
storage_key = f"notebooks/{notebook_id}/{file_id}{ext}"

await storage().upload(storage_key, content, content_type)  # 异步

source.storage_key = storage_key
source.storage_backend = settings.storage_backend
# file_path 字段不再写入（旧数据保留）
```

### 6.2 摄取 Pipeline（`agents/ingestion.py`）

```python
# 改造前
async def _extract_text(source: Source) -> str:
    if source.type == "pdf" and source.file_path:
        raw = _parse_pdf(source.file_path)           # 直接读本地路径
    elif source.type in ("md", "txt") and source.file_path:
        raw = _parse_text_file(source.file_path)

# 改造后（兼容新旧数据）
async def _extract_text(source: Source) -> str:
    from app.providers.storage import storage

    if source.type == "pdf":
        if source.storage_key:
            content = await storage().download(source.storage_key)
            raw = _parse_pdf_bytes(content)          # 新：从 bytes 解析
        elif source.file_path:
            raw = _parse_pdf(source.file_path)       # 旧数据回退
        else:
            raw = ""
    elif source.type in ("md", "txt"):
        if source.storage_key:
            content = await storage().download(source.storage_key)
            raw = content.decode("utf-8", errors="ignore")
        elif source.file_path:
            raw = _parse_text_file(source.file_path) # 旧数据回退
        else:
            raw = ""
    elif source.type == "web" and source.url:
        raw = await _fetch_url(source.url)
    else:
        raw = source.raw_text or ""
    return _sanitize(raw)

# 新增辅助函数（避免写临时文件）
def _parse_pdf_bytes(content: bytes) -> str:
    import io
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n\n".join(p.extract_text() for p in reader.pages if p.extract_text())
```

### 6.3 文件删除（`source/router.py`）

```python
@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: UUID, db: DbDep, current_user: CurrentUser):
    source = await _get_owned_source(db, source_id, current_user.id)
    notebook_id = source.notebook_id

    # 删除存储文件（新数据）
    if source.storage_key:
        from app.providers.storage import storage
        try:
            await storage().delete(source.storage_key)
        except Exception as exc:
            logger.warning("Failed to delete storage file %s: %s", source.storage_key, exc)

    # 删除旧数据本地文件（回退兼容）
    elif source.file_path and os.path.exists(source.file_path):
        try:
            os.unlink(source.file_path)
        except OSError as exc:
            logger.warning("Failed to delete local file %s: %s", source.file_path, exc)

    await db.delete(source)
    await db.flush()
    asyncio.create_task(_refresh_summary_safe(notebook_id))
```

### 6.4 新增文件下载端点

```python
# api/app/domains/source/router.py 新增

@router.get("/sources/{source_id}/download")
async def download_source_file(
    source_id: UUID, db: DbDep, current_user: CurrentUser
):
    """
    获取原始文件。
    - 本地后端：StreamingResponse 直接流式传输
    - 云后端：302 redirect 到带签名的临时 URL（TTL 1h）
    """
    source = await _get_owned_source(db, source_id, current_user.id)

    if not source.storage_key and not source.file_path:
        raise HTTPException(status_code=404, detail="No file associated with this source")

    from app.providers.storage import storage
    from fastapi.responses import RedirectResponse, StreamingResponse

    if source.storage_key:
        url = await storage().get_url(source.storage_key, expires_in=3600)
        # 本地后端返回内部路径，需要直接流式；云后端返回签名 URL，重定向即可
        if url.startswith("/api/"):
            content = await storage().download(source.storage_key)
            media_type = _guess_media_type(source.storage_key)
            return StreamingResponse(
                iter([content]),
                media_type=media_type,
                headers={"Content-Disposition": f'inline; filename="{source.title}"'},
            )
        return RedirectResponse(url=url, status_code=302)

    # 旧数据：直接读本地文件
    if source.file_path and os.path.exists(source.file_path):
        async def _file_iter():
            async with aiofiles.open(source.file_path, "rb") as f:
                while chunk := await f.read(65536):
                    yield chunk
        return StreamingResponse(
            _file_iter(),
            media_type=_guess_media_type(source.file_path),
            headers={"Content-Disposition": f'inline; filename="{source.title}"'},
        )

    raise HTTPException(status_code=404, detail="File not found on disk")


def _guess_media_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {".pdf": "application/pdf", ".md": "text/markdown", ".txt": "text/plain"}.get(ext, "application/octet-stream")
```

---

## 七、完整请求流程对比

### 上传流程

```
改造前：
  POST /sources/upload
    → open(local_path, "wb")  [同步阻塞]
    → sources.file_path = "/abs/path/file.pdf"

改造后：
  POST /sources/upload
    → storage().upload("notebooks/nb_id/uuid.pdf", bytes)  [异步]
    → sources.storage_key = "notebooks/nb_id/uuid.pdf"
    → sources.storage_backend = "oss"
```

### 摄取流程

```
改造前（Celery worker 必须与 API 共享本地磁盘）：
  ingest_source(source_id)
    → PdfReader(source.file_path)  [依赖本地路径]

改造后（Celery worker 可运行在独立容器）：
  ingest_source(source_id)
    → storage().download(source.storage_key) → bytes
    → PdfReader(io.BytesIO(bytes))
```

### 下载流程

```
GET /sources/{id}/download
  → 本地：StreamingResponse(aiofiles.open(path))
  → 云端：302 → https://bucket.oss.com/key?X-Amz-Signature=...&Expires=3600
```

---

## 八、实施顺序

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `config.py` | 扩展 storage 配置字段 |
| 2 | `providers/storage.py` | 实现抽象层 + 三个 Provider |
| 3 | `alembic/versions/008_source_storage_key.py` | 迁移：新增两列 |
| 4 | `domains/source/router.py` | 上传改走 provider，新增下载端点，删除联动 |
| 5 | `agents/ingestion.py` | `_extract_text` 改走 provider，兼容旧数据 |
| 6 | 安装依赖 | `aioboto3`, `aiofiles` |

---

## 九、依赖安装

```bash
pip install aioboto3 aiofiles
# aioboto3 覆盖 AWS S3 / MinIO / 阿里云 OSS / Cloudflare R2
# aiofiles 替换现有同步 open()
```

---

## 十、迁移旧数据（可选）

对于历史数据（`file_path` 不为空，`storage_key` 为空），可在部署后运行一次性迁移脚本：

```python
# scripts/migrate_storage.py
# 读取所有 file_path 不为空的 Source 行
# 构造 storage_key = "notebooks/<nb_id>/<uuid><ext>"
# 调用 storage().upload(key, file_bytes)
# 更新 sources.storage_key, sources.storage_backend
```

建议在切换 `storage_backend` 之前运行，确保 Celery worker 的摄取任务不会因旧路径失效而失败。

---

## 十一、扩展性说明

后续新增存储后端只需：
1. 在 `providers/storage.py` 新增一个继承 `StorageProvider` 的类（约 50 行）
2. 在 `get_storage_provider()` 工厂函数中增加一个 `elif` 分支
3. 在 `config.py` 的 `Literal[...]` 中追加新后端名称

业务代码（router、ingestion）**无需任何改动**。
