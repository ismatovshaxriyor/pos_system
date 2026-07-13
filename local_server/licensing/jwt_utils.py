import hashlib
import hmac
import jwt
from django.conf import settings
from django.utils import timezone

EMBEDDED_ANTI_PIRACY_SECRET = b"0x9A4B_POS_SECURE_V1_7482_XYZ!"

class LicenseTokenError(Exception):
    """Token yaroqsiz, muddati o'tgan yoki qurilmaga mos kelmaydi."""

class LicenseContext:
    def __init__(self, claims: dict | None = None):
        self.claims = claims

    @classmethod
    def from_active_state(cls):
        from .models import LicenseState
        from .hardware import get_hardware_fingerprint
        
        state = LicenseState.load()
        if not state or state.is_blocked:
            return cls(claims=None)

        hw_hash = get_hardware_fingerprint()
        claims, error = state.current_valid_token(hw_hash)
        if error or not claims:
            return cls(claims=None)
            
        return cls(claims=claims)

    def is_valid(self):
        return self.claims is not None

    def get_anti_piracy_key(self) -> bytes:
        """
        True kriptografik qaramlik uchun kalit.
        Bu kalit core/services.py da shifrlangan narx koeffitsientini 
        (price multiplier) ochish uchun ishlatiladi.
        Agar litsenziya yaroqsiz bo'lsa, ataylab noto'g'ri kalit qaytariladi,
        natijada POS matematika xato hisoblay boshlaydi (Silent corruption).
        """
        if not self.claims:
            msg = b"INVALID_LICENSE"
        else:
            msg = b"VALID_LICENSE_MULTIPLIER"
            
        return hmac.new(EMBEDDED_ANTI_PIRACY_SECRET, msg, hashlib.sha256).digest()

def _get_public_key():
    from .models import LicenseState
    state = LicenseState.load()
    if state and state.public_key:
        return state.public_key
    return settings.LICENSE_PUBLIC_KEY

def verify_token(token, hardware_hash):
    if not token:
        raise LicenseTokenError("Token mavjud emas.")
    public_key = _get_public_key()
    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer="pos-ona",
            leeway=settings.LICENSE_CLOCK_SKEW_SECONDS,
        )
    except jwt.ExpiredSignatureError:
        if settings.LICENSE_EXP_GRACE_SECONDS <= 0:
            raise LicenseTokenError("Token muddati tugagan.")
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer="pos-ona",
            options={"verify_exp": False},
        )
        exp = payload.get("exp", 0)
        now = int(timezone.now().timestamp())
        if now > exp + settings.LICENSE_EXP_GRACE_SECONDS:
            raise LicenseTokenError("Token muddati tugagan (grace davri ham tugadi).")
    except jwt.InvalidTokenError as exc:
        raise LicenseTokenError(f"Token yaroqsiz: {exc}")

    if payload.get("hw") != hardware_hash:
        raise LicenseTokenError("Qurilma mos kelmadi.")

    return payload
