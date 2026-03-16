"""
One-time backfill script: generate and store embeddings for existing user_memories
records that have no embedding yet (embedding IS NULL).

Run AFTER applying migration 017:
    cd api
    python -m scripts.backfill_memory_embeddings

The HNSW index in migration 017 is created with WHERE embedding IS NOT NULL,
so it is safe to run migrations first and backfill afterwards — new writes via
_upsert_memory() already store embeddings going forward.

Options (env vars):
    BATCH_SIZE   — records per embedding API batch (default: 50)
    DRY_RUN      — if set to "1", print what would be processed but don't write
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# Add project root to sys.path so we can import app.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill")

BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "50"))
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"


async def backfill() -> None:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models import UserMemory
    from app.providers.embedding import embed_texts

    logger.info(
        "Starting memory embedding backfill (batch_size=%d, dry_run=%s)",
        BATCH_SIZE, DRY_RUN,
    )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserMemory).where(UserMemory.embedding.is_(None))
        )
        records = result.scalars().all()

    if not records:
        logger.info("No records without embeddings found — nothing to do.")
        return

    logger.info("Found %d records without embeddings.", len(records))
    if DRY_RUN:
        logger.info("DRY_RUN=1 — exiting without making changes.")
        return

    total_updated = 0
    errors = 0

    for batch_start in range(0, len(records), BATCH_SIZE):
        batch = records[batch_start : batch_start + BATCH_SIZE]
        texts = [f"{m.key}: {m.value}" for m in batch]

        try:
            embeddings = await embed_texts(texts)
        except Exception as exc:
            logger.error(
                "embed_texts failed for batch starting at index %d: %s — skipping batch",
                batch_start, exc,
            )
            errors += len(batch)
            continue

        async with AsyncSessionLocal() as session:
            for record, emb in zip(batch, embeddings):
                # Re-fetch within the session to avoid detached-instance issues
                db_record = await session.get(UserMemory, record.id)
                if db_record is None:
                    continue
                if db_record.embedding is not None:
                    # Already filled by a concurrent write — skip
                    continue
                db_record.embedding = emb
            await session.commit()

        total_updated += len(batch)
        logger.info(
            "Progress: %d / %d records updated (batch %d–%d)",
            total_updated, len(records),
            batch_start, batch_start + len(batch) - 1,
        )

    logger.info(
        "Backfill complete. Updated: %d, Errors: %d, Total: %d",
        total_updated, errors, len(records),
    )

    if total_updated > 0:
        logger.info(
            "The HNSW index (ix_user_memories_embedding_hnsw) will now cover "
            "the backfilled records automatically — no manual reindex needed."
        )


if __name__ == "__main__":
    asyncio.run(backfill())
