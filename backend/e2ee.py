"""E2EE envelope validation. The server never receives content or recovery keys.

Public keys are immutable per account. Private-key recovery is encrypted by a
256-bit random recovery code generated on the client. No server-side decrypt API.
"""
import base64
import hashlib
import json
from typing import Literal, Optional
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def decode(value, length=None, maximum=16384):
    try:
        if not isinstance(value, str) or len(value) > maximum * 2:
            raise ValueError()
        data = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b'-_', validate=True)
        if len(data) > maximum or length is not None and len(data) != length:
            raise ValueError()
        return data
    except (ValueError, TypeError):
        raise ValueError("Formato criptográfico inválido")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PublicKey(Strict):
    kty: Literal["EC"]
    crv: Literal["P-256"]
    x: str = Field(..., min_length=43, max_length=43)
    y: str = Field(..., min_length=43, max_length=43)

    @model_validator(mode="after")
    def valid_point(self):
        public_key(self.model_dump())
        return self


def public_key(jwk):
    x, y = int.from_bytes(decode(jwk["x"], 32), "big"), int.from_bytes(decode(jwk["y"], 32), "big")
    return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()


class PublicBundle(Strict):
    version: Literal[1]
    encryption_key: PublicKey
    signing_key: PublicKey


class Backup(Strict):
    salt: str = Field(..., min_length=43, max_length=43)
    iv: str = Field(..., min_length=16, max_length=16)
    ciphertext: str = Field(..., min_length=64, max_length=12000)

    @model_validator(mode="after")
    def lengths(self):
        decode(self.salt, 32); decode(self.iv, 12)
        decode(self.ciphertext, maximum=8192)
        return self


class IdentityIn(Strict):
    public: PublicBundle
    backup: Backup
    proof: str = Field(..., min_length=86, max_length=86)


def fingerprint(bundle):
    return hashlib.sha256(canonical(bundle)).hexdigest()


def verify_signature(jwk, value, signature):
    try:
        raw = decode(signature, 64)
        der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
        public_key(jwk).verify(der, canonical(value), ec.ECDSA(hashes.SHA256()))
    except (InvalidSignature, ValueError):
        raise HTTPException(400, "Assinatura da mensagem inválida")


def validate_identity(body, uid):
    public, backup = body.public.model_dump(), body.backup.model_dump()
    verify_signature(public["signing_key"], {"purpose": "servicoja.identity.v1", "user_id": uid, "public": public, "backup": backup}, body.proof)
    return fingerprint(public)


def public_identity(record):
    return {k: record[k] for k in ("user_id", "public", "key_id", "created_at")}


class WrappedKey(Strict):
    iv: str = Field(..., min_length=16, max_length=16)
    ciphertext: str = Field(..., min_length=64, max_length=64)

    @model_validator(mode="after")
    def lengths(self):
        decode(self.iv, 12); decode(self.ciphertext, 48)
        return self


class Header(Strict):
    version: Literal[1]
    conversation_id: str = Field(..., min_length=1, max_length=80)
    sender_id: str = Field(..., min_length=1, max_length=80)
    client_id: str = Field(..., min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal["text", "audio"]
    keys: dict[str, str] = Field(..., min_length=2, max_length=2)
    ephemeral_key: PublicKey
    salt: str = Field(..., min_length=43, max_length=43)

    @field_validator("keys")
    @classmethod
    def key_ids(cls, value):
        if any(not uid or len(uid) > 80 or len(kid) != 64 or any(c not in "0123456789abcdef" for c in kid) for uid, kid in value.items()):
            raise ValueError("Identidades inválidas")
        return value

    @field_validator("salt")
    @classmethod
    def salt_length(cls, value):
        decode(value, 32)
        return value


class Attachment(Strict):
    iv: str = Field(..., min_length=16, max_length=16)
    sha256: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    size: int = Field(..., ge=17, le=4 * 1024 * 1024 + 16)

    @field_validator("iv")
    @classmethod
    def iv_length(cls, value):
        decode(value, 12)
        return value


class Envelope(Strict):
    header: Header
    iv: str = Field(..., min_length=16, max_length=16)
    ciphertext: str = Field(..., min_length=24, max_length=16000)
    wrapped_keys: dict[str, WrappedKey] = Field(..., min_length=2, max_length=2)
    attachment: Optional[Attachment] = None
    signature: str = Field(..., min_length=86, max_length=86)

    @model_validator(mode="after")
    def structure(self):
        decode(self.iv, 12); decode(self.ciphertext, maximum=10000); decode(self.signature, 64)
        if set(self.wrapped_keys) != set(self.header.keys):
            raise ValueError("Destinatários inválidos")
        if (self.header.kind == "audio") != (self.attachment is not None):
            raise ValueError("Anexo inválido")
        if self.attachment and self.attachment.iv == self.iv:
            raise ValueError("Nonce reutilizado")
        return self


async def validate_envelope(db, conv, uid, envelope, kind):
    header = envelope.header
    participants = set(conv["participants"])
    if uid not in participants or header.sender_id != uid or header.conversation_id != conv["id"] or header.kind != kind or set(header.keys) != participants:
        raise HTTPException(400, "Mensagem não pertence a esta conversa")
    records = await db.e2ee_identities.find({"user_id": {"$in": list(participants)}}, {"_id": 0, "backup": 0}).to_list(2)
    identities = {r["user_id"]: r for r in records}
    if set(identities) != participants or any(identities[p]["key_id"] != header.keys[p] for p in participants):
        raise HTTPException(409, "Os dois participantes precisam ativar a proteção do chat")
    value = envelope.model_dump(exclude={"signature"})
    verify_signature(identities[uid]["public"]["signing_key"], value, envelope.signature)
    return envelope.model_dump()
