from fastapi import APIRouter

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success
from app.services.public_home_service import (
    approve_public_home_draft,
    backfill_public_home_portrait_snapshot,
    discard_public_home_draft,
    generate_public_home_draft,
    get_public_home_admin_state,
)

from .schemas import PublicHomeAdminStateOut

router = APIRouter(prefix="/public-home", tags=["public-home"])


@router.get("", response_model=ApiResponse[PublicHomeAdminStateOut])
async def get_public_home_state(db: DbDep, current_user: CurrentUser):
    return success(await get_public_home_admin_state(db, current_user.id))


@router.post("/generate", response_model=ApiResponse[PublicHomeAdminStateOut])
async def generate_public_home(db: DbDep, current_user: CurrentUser):
    return success(await generate_public_home_draft(db, current_user.id))


@router.post("/approve", response_model=ApiResponse[PublicHomeAdminStateOut])
async def approve_public_home(db: DbDep, current_user: CurrentUser):
    return success(await approve_public_home_draft(db, current_user.id))


@router.post("/discard", response_model=ApiResponse[PublicHomeAdminStateOut])
async def discard_public_home(db: DbDep, current_user: CurrentUser):
    return success(await discard_public_home_draft(db, current_user.id))


@router.post("/backfill-portrait", response_model=ApiResponse[PublicHomeAdminStateOut])
async def backfill_public_home_portrait(db: DbDep, current_user: CurrentUser):
    return success(await backfill_public_home_portrait_snapshot(db, current_user.id))
