"""
Tests for notebook CRUD endpoints.
"""
from __future__ import annotations


class TestNotebookCRUD:
    async def test_list_notebooks_empty(self, client, auth_headers):
        resp = await client.get("/api/v1/notebooks", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data, list)

    async def test_create_notebook(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/notebooks",
            headers=auth_headers,
            json={"title": "My Test Notebook"},
        )
        assert resp.status_code == 201
        nb = resp.json()["data"]
        assert nb["title"] == "My Test Notebook"
        assert "id" in nb

    async def test_create_notebook_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/notebooks",
            json={"title": "No Auth"},
        )
        assert resp.status_code == 401

    async def test_get_notebook_by_id(self, client, auth_headers):
        create_resp = await client.post(
            "/api/v1/notebooks",
            headers=auth_headers,
            json={"title": "Fetch Me"},
        )
        assert create_resp.status_code == 201, create_resp.text
        nb_id = create_resp.json()["data"]["id"]

        get_resp = await client.get(f"/api/v1/notebooks/{nb_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["data"]["id"] == nb_id

    async def test_get_nonexistent_notebook_returns_404(self, client, auth_headers):
        resp = await client.get(
            "/api/v1/notebooks/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_notebook_title(self, client, auth_headers):
        create_resp = await client.post(
            "/api/v1/notebooks",
            headers=auth_headers,
            json={"title": "Old Title"},
        )
        assert create_resp.status_code == 201, create_resp.text
        nb_id = create_resp.json()["data"]["id"]

        patch_resp = await client.patch(
            f"/api/v1/notebooks/{nb_id}",
            headers=auth_headers,
            json={"title": "New Title"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["data"]["title"] == "New Title"

    async def test_delete_notebook(self, client, auth_headers):
        create_resp = await client.post(
            "/api/v1/notebooks",
            headers=auth_headers,
            json={"title": "Delete Me"},
        )
        assert create_resp.status_code == 201, create_resp.text
        nb_id = create_resp.json()["data"]["id"]

        del_resp = await client.delete(f"/api/v1/notebooks/{nb_id}", headers=auth_headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"/api/v1/notebooks/{nb_id}", headers=auth_headers)
        assert get_resp.status_code == 404

    async def test_list_notebooks_returns_created(self, client, auth_headers):
        create_resp = await client.post(
            "/api/v1/notebooks",
            headers=auth_headers,
            json={"title": "Listed Notebook"},
        )
        assert create_resp.status_code == 201, create_resp.text

        list_resp = await client.get("/api/v1/notebooks", headers=auth_headers)
        assert list_resp.status_code == 200
        titles = [nb["title"] for nb in list_resp.json()["data"]]
        assert "Listed Notebook" in titles
