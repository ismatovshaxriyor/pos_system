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

                ErrorLog.objects.create(
                    level=record.levelname,
                    logger_name=record.name or '',
                    message=record.getMessage()[:MAX_MESSAGE_CHARS],
                    traceback=self._format_traceback(record),
                    module=record.module or '',
                    # funcName is None when a LogRecord is built without frame
                    # info (e.g. constructed directly rather than via
                    # Logger._log()) - the model column is NOT NULL, so this
                    # must be coalesced rather than passed through as-is.
                    func_name=record.funcName or '',
                    line_no=record.lineno,
                    occurred_at=datetime.fromtimestamp(record.created, tz=dt_timezone.utc),
                )
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
    def _format_traceback(record):
        if not record.exc_info:
            return ''
        text = logging.Formatter().formatException(record.exc_info)
        return text[:MAX_TRACEBACK_CHARS]
