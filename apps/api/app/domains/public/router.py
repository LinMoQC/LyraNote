from uuid import UUID

from fastapi import APIRouter
from app.dependencies import DbDep
from app.schemas.response import ApiResponse, success
from app.services.public_home_service import (
    get_public_notebook_detail_payload,
    get_public_site_payload,
    list_public_notebooks_payload,
)
from app.domains.public_home.schemas import PublicSiteOut
from .schemas import PublicNotebookDetailOut, PublicNotebookOut

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/notebooks", response_model=ApiResponse[list[PublicNotebookOut]])
async def list_public_notebooks(db: DbDep):
    return success(await list_public_notebooks_payload(db))


@router.get("/notebooks/{notebook_id}", response_model=ApiResponse[PublicNotebookDetailOut])
async def get_public_notebook(notebook_id: UUID, db: DbDep):
    return success(await get_public_notebook_detail_payload(db, notebook_id))


@router.get("/site", response_model=ApiResponse[PublicSiteOut])
async def get_public_site(db: DbDep):
    return success(await get_public_site_payload(db))
