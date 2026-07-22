import logging
import threading
from datetime import datetime, timezone as dt_timezone

MAX_MESSAGE_CHARS = 5_000
MAX_TRACEBACK_CHARS = 10_000


class DatabaseErrorLogHandler(logging.Handler):
    """
    ERROR/CRITICAL log yozuvlarini mahalliy ErrorLog jadvaliga yozadi.

    MUHIM: bu klass Django LOGGING sozlamasi orqali configure_logging()
    tomonidan chaqiriladi - bu esa apps.populate() dan OLDIN ishlaydi.
    Shu sabab .models import qilish albatta emit() ICHIDA (deferred) bo'lishi
    kerak - modul darajasida import qilinsa AppRegistryNotReady xatosi
    beriladi.

    Standard logging.Handler shartnomasi: emit() hech qachon istisno
    otmasligi kerak. Bundan tashqari, agar bazaga yozishning o'zi (masalan
    ulanish uzilgani sabab) ERROR log hosil qilsa va bu logger ham shu
    handlerga ulangan bo'lsa - cheksiz rekursiya xavfi bor. `_local.writing`
    reentrancy bayrog'i buni oldini oladi (nested chaqiruv jim tashlab
    yuboriladi).
    """

    _local = threading.local()

    def emit(self, record):
        if getattr(self._local, 'writing', False):
            return  # reentrant call - drop silently, do not recurse

        import asyncio

        def save_log():
            self._local.writing = True
            try:
                from .models import ErrorLog  # lazy import - see docstring

                tb_text = self._format_traceback(record)
                ErrorLog.objects.create(
                    level=record.levelname,
                    logger_name=record.name or '',
                    message=record.getMessage()[:MAX_MESSAGE_CHARS],
                    traceback=tb_text,
                    module=record.module or '',
                    func_name=record.funcName or '',
                    line_no=record.lineno,
                    occurred_at=datetime.fromtimestamp(record.created, tz=dt_timezone.utc),
                )

                self._send_telegram_alert(record, tb_text)
            except Exception:
                # Never propagate - standard Handler contract. handleError()
                # writes to stderr (respecting logging.raiseExceptions) and
                # never re-enters the logging system.
                self.handleError(record)
            finally:
                self._local.writing = False

        # Asinxron event loop ichida ishlayotgan bo'lsak, event loop bloklanib
        # qolmasligi va SynchronousOnlyOperation xatosi chiqmasligi uchun 
        # fon oqimida (Thread) ishga tushiramiz. Sinxron muhitda (masalan, testlarda)
        # esa to'g'ridan-to'g'ri sinxron ishlatamiz.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None:
            threading.Thread(target=save_log, daemon=True).start()
        else:
            save_log()

    @staticmethod
    def _send_telegram_alert(record, traceback_text):
        try:
            import requests
            from .models import LicenseState
            state = LicenseState.load()
            token = state.telegram_bot_token if state else ''
            chat_id = state.telegram_chat_id if state else ''
            if not token or not chat_id:
                return

            rest_name = state.restaurant_name or "Local Server"
            msg = (
                f"🚨 *POS SYSTEM CRITICAL ALERT*\n"
                f"📍 Restoran: {rest_name}\n"
                f"⚠️ Level: {record.levelname}\n"
                f"📝 Logger: {record.name}\n"
                f"💬 Message: {record.getMessage()[:500]}\n"
            )
            if traceback_text:
                msg += f"```\n{traceback_text[:1000]}\n```"

            url = f"https://api.telegram.org/bot{token}/sendMessage"
            requests.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"}, timeout=5)
        except Exception:
            pass

    @staticmethod
    def _format_traceback(record):
        if not record.exc_info:
            return ''
        text = logging.Formatter().formatException(record.exc_info)
        return text[:MAX_TRACEBACK_CHARS]
