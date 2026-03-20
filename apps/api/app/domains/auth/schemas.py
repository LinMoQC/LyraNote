"""
Auth domain Pydantic schemas.
"""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    username: str | None
    name: str | None
    email: str | None
    avatar_url: str | None = None
    has_google: bool = False
    has_github: bool = False

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class PasswordUpdateRequest(BaseModel):
    old_password: str
    new_password: str
