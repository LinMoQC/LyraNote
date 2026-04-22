from uuid import UUID

from fastapi import APIRouter, status

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success
from app.services import notebook_service
from .schemas import NotebookCreate, NotebookOut, NotebookUpdate

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


@router.get("", response_model=ApiResponse[list[NotebookOut]])
async def list_notebooks(db: DbDep, current_user: CurrentUser):
    notebooks = await notebook_service.list_user_notebooks(db, current_user.id)
    return success(notebooks)


@router.post("", response_model=ApiResponse[NotebookOut], status_code=status.HTTP_201_CREATED)
async def create_notebook(body: NotebookCreate, db: DbDep, current_user: CurrentUser):
    notebook = await notebook_service.create_notebook(
        db,
        current_user.id,
        body.model_dump(),
    )
    out = NotebookOut.model_validate(notebook)
    out.is_new = True
    return success(out)


@router.get("/global", response_model=ApiResponse[NotebookOut])
async def get_global_notebook(db: DbDep, current_user: CurrentUser):
    notebook = await notebook_service.get_or_create_global_notebook(db, current_user.id)
    return success(notebook)


@router.get("/{notebook_id}", response_model=ApiResponse[NotebookOut])
async def get_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await notebook_service.get_notebook_detail(db, notebook_id, current_user.id)
    return success(notebook)


@router.patch("/{notebook_id}", response_model=ApiResponse[NotebookOut])
async def update_notebook(
    notebook_id: UUID, body: NotebookUpdate, db: DbDep, current_user: CurrentUser
):
    notebook = await notebook_service.update_notebook(
        db,
        notebook_id,
        current_user.id,
        body.model_dump(exclude_none=True),
    )
    return success(notebook)


@router.patch("/{notebook_id}/publish", response_model=ApiResponse[NotebookOut])
async def publish_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await notebook_service.publish_notebook(db, notebook_id, current_user.id)
    return success(notebook)


@router.patch("/{notebook_id}/unpublish", response_model=ApiResponse[NotebookOut])
async def unpublish_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    notebook = await notebook_service.unpublish_notebook(db, notebook_id, current_user.id)
    return success(notebook)


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    await notebook_service.delete_notebook(db, notebook_id, current_user.id)
