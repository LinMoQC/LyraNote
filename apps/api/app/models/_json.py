from sqlalchemy import JSON as SAJSON
from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSONB

json_type = SAJSON().with_variant(JSONB(astext_type=Text()), "postgresql")
