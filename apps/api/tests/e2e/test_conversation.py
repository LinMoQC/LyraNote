"""
End-to-end tests for conversation and message endpoints.

Uses the full ASGI client (client + auth_headers fixtures) to test the complete
HTTP stack including routing, auth middleware, and database persistence.

Routes tested:
  POST   /api/v1/notebooks/{nb_id}/conversations
  GET    /api/v1/notebooks/{nb_id}/conversations
  DELETE /api/v1/conversations/{conv_id}
  POST   /api/v1/conversations/{conv_id}/messages/save
  GET    /api/v1/conversations/{conv_id}/messages
"""
from __future__ import annotations


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _create_notebook(client, auth_headers, title: str = "E2E Notebook") -> str:
    """Create a notebook and return its id."""
    resp = await client.post(
        "/api/v1/notebooks",
        headers=auth_headers,
        json={"title": title},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _create_conversation(client, auth_headers, nb_id: str, title: str = "E2E Conv") -> str:
    """Create a conversation inside the given notebook and return its id."""
    resp = await client.post(
        f"/api/v1/notebooks/{nb_id}/conversations",
        headers=auth_headers,
        json={"title": title},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["data"]["id"]


# ── Conversation CRUD ─────────────────────────────────────────────────────────

class TestConversationEndpoints:
    async def test_create_conversation_returns_id(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        resp = await client.post(
            f"/api/v1/notebooks/{nb_id}/conversations",
            headers=auth_headers,
            json={"title": "New Chat"},
        )
        assert resp.status_code in (200, 201)
        data = resp.json()["data"]
        assert "id" in data
        assert data["notebook_id"] == nb_id

    async def test_create_conversation_with_no_title(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        resp = await client.post(
            f"/api/v1/notebooks/{nb_id}/conversations",
            headers=auth_headers,
            json={},
        )
        assert resp.status_code in (200, 201)
        assert resp.json()["data"]["id"]

    async def test_list_conversations_empty_initially(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers, title="Empty NB")
        resp = await client.get(
            f"/api/v1/notebooks/{nb_id}/conversations",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    async def test_list_conversations_includes_created(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id, title="Listed Conv")

        resp = await client.get(
            f"/api/v1/notebooks/{nb_id}/conversations",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()["data"]]
        assert conv_id in ids

    async def test_delete_conversation_removes_it(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        del_resp = await client.delete(
            f"/api/v1/conversations/{conv_id}",
            headers=auth_headers,
        )
        assert del_resp.status_code == 204

        list_resp = await client.get(
            f"/api/v1/notebooks/{nb_id}/conversations",
            headers=auth_headers,
        )
        ids = [c["id"] for c in list_resp.json()["data"]]
        assert conv_id not in ids

    async def test_create_conversation_requires_auth(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        resp = await client.post(
            f"/api/v1/notebooks/{nb_id}/conversations",
            json={"title": "No Auth"},
        )
        assert resp.status_code == 401

    async def test_list_conversations_requires_auth(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        resp = await client.get(f"/api/v1/notebooks/{nb_id}/conversations")
        assert resp.status_code == 401

    async def test_create_conversation_nonexistent_notebook_returns_error(
        self, client, auth_headers
    ):
        resp = await client.post(
            "/api/v1/notebooks/00000000-0000-0000-0000-000000000000/conversations",
            headers=auth_headers,
            json={"title": "Ghost Conv"},
        )
        assert resp.status_code in (404, 403)


# ── MessageSave endpoint ──────────────────────────────────────────────────────

class TestMessageSaveEndpoint:
    async def test_save_user_message(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            headers=auth_headers,
            json={"role": "user", "content": "What is LyraNote?"},
        )
        assert resp.status_code in (200, 201)
        data = resp.json()["data"]
        assert data["role"] == "user"
        assert data["content"] == "What is LyraNote?"
        assert "id" in data

    async def test_save_assistant_message_with_reasoning(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            headers=auth_headers,
            json={
                "role": "assistant",
                "content": "LyraNote is a knowledge management tool.",
                "reasoning": "The user asked about LyraNote. Based on context...",
            },
        )
        assert resp.status_code in (200, 201)
        data = resp.json()["data"]
        assert data["role"] == "assistant"
        assert data["reasoning"] == "The user asked about LyraNote. Based on context..."

    async def test_save_message_without_reasoning_reasoning_is_null(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            headers=auth_headers,
            json={"role": "user", "content": "Simple question"},
        )
        assert resp.status_code in (200, 201)
        assert resp.json()["data"]["reasoning"] is None

    async def test_save_message_to_nonexistent_conversation_returns_error(
        self, client, auth_headers
    ):
        resp = await client.post(
            "/api/v1/conversations/00000000-0000-0000-0000-000000000000/messages/save",
            headers=auth_headers,
            json={"role": "user", "content": "Hello?"},
        )
        assert resp.status_code in (404, 403)

    async def test_save_message_requires_auth(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            json={"role": "user", "content": "No auth"},
        )
        assert resp.status_code == 401


# ── Message list endpoint ─────────────────────────────────────────────────────

class TestMessageListEndpoint:
    async def test_list_messages_empty_initially(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.get(
            f"/api/v1/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    async def test_list_messages_returns_saved(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            headers=auth_headers,
            json={"role": "user", "content": "Question"},
        )
        await client.post(
            f"/api/v1/conversations/{conv_id}/messages/save",
            headers=auth_headers,
            json={"role": "assistant", "content": "Answer"},
        )

        resp = await client.get(
            f"/api/v1/conversations/{conv_id}/messages",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        messages = resp.json()["data"]
        assert len(messages) == 2
        roles = {m["role"] for m in messages}
        assert roles == {"user", "assistant"}

    async def test_list_messages_requires_auth(self, client, auth_headers):
        nb_id = await _create_notebook(client, auth_headers)
        conv_id = await _create_conversation(client, auth_headers, nb_id)

        resp = await client.get(f"/api/v1/conversations/{conv_id}/messages")
        assert resp.status_code == 401
