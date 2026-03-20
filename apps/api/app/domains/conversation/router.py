"""Conversation router — thin HTTP layer delegating to ConversationService."""

from uuid import UUID

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success
from app.services.conversation_service import ConversationService
from .schemas import ConversationCreate, ConversationOut, MessageCreate, MessageOut, MessageSave

router = APIRouter(tags=["conversations"])


@router.get(
    "/notebooks/{notebook_id}/conversations",
    response_model=ApiResponse[list[ConversationOut]],
)
async def list_conversations(
    notebook_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    svc = ConversationService(db, current_user.id)
    return success(await svc.list_by_notebook(notebook_id, offset=offset, limit=limit))


@router.post(
    "/notebooks/{notebook_id}/conversations",
    response_model=ApiResponse[ConversationOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    notebook_id: UUID, body: ConversationCreate, db: DbDep, current_user: CurrentUser
):
    svc = ConversationService(db, current_user.id)
    return success(await svc.create(notebook_id, body.title))


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=ApiResponse[list[MessageOut]],
)
async def list_messages(
    conversation_id: UUID,
    db: DbDep,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    svc = ConversationService(db, current_user.id)
    return success(await svc.list_messages(conversation_id, offset=offset, limit=limit))


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ApiResponse[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: UUID, body: MessageCreate, db: DbDep, current_user: CurrentUser
):
    svc = ConversationService(db, current_user.id)
    return success(await svc.send_message(conversation_id, body.content))


@router.post(
    "/conversations/{conversation_id}/messages/save",
    response_model=ApiResponse[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
async def save_message(
    conversation_id: UUID,
    body: MessageSave,
    db: DbDep,
    current_user: CurrentUser,
):
    svc = ConversationService(db, current_user.id)
    return success(await svc.save_message(
        conversation_id, body.role, body.content, body.citations, body.reasoning,
    ))


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: UUID,
    body: MessageCreate,
    db: DbDep,
    current_user: CurrentUser,
):
    svc = ConversationService(db, current_user.id)
    return StreamingResponse(
        svc.stream_agent(
            conversation_id,
            body.content,
            global_search=body.global_search,
            tool_hint=body.tool_hint,
            attachment_ids=body.attachment_ids,
            attachments_meta=[a.model_dump() for a in body.attachments_meta] if body.attachments_meta else None,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: UUID, db: DbDep, current_user: CurrentUser
):
    svc = ConversationService(db, current_user.id)
    await svc.delete(conversation_id)
