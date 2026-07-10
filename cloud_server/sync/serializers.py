from rest_framework import serializers

MAX_EVENTS_PER_BATCH = 500


class ActivationSerializer(serializers.Serializer):
    license_key = serializers.CharField(max_length=40)
    hardware_hash = serializers.CharField(max_length=128)
    app_version = serializers.CharField(max_length=50, required=False, allow_blank=True)


class RenewSerializer(serializers.Serializer):
    hardware_hash = serializers.CharField(max_length=128)


class HeartbeatSerializer(serializers.Serializer):
    cpu_percent = serializers.FloatField(required=False, allow_null=True)
    ram_percent = serializers.FloatField(required=False, allow_null=True)
    disk_percent = serializers.FloatField(required=False, allow_null=True)
    app_version = serializers.CharField(max_length=50, required=False, allow_blank=True)
    unsynced_count = serializers.IntegerField(required=False, allow_null=True)
    last_order_at = serializers.DateTimeField(required=False, allow_null=True)


class CommandResultSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=("completed", "failed"))
    result = serializers.JSONField(required=False, default=dict)


class ErrorLogEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    level = serializers.ChoiceField(choices=('ERROR', 'CRITICAL'))
    logger_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    message = serializers.CharField()
    traceback = serializers.CharField(required=False, allow_blank=True, default='')
    module = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    func_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    line_no = serializers.IntegerField(required=False, allow_null=True, default=None)
    occurred_at = serializers.DateTimeField()


class ErrorLogBatchSerializer(serializers.Serializer):
    events = ErrorLogEventSerializer(many=True, allow_empty=False)

    def validate_events(self, value):
        if len(value) > MAX_EVENTS_PER_BATCH:
            raise serializers.ValidationError(
                f"Bitta so'rovda ko'pi bilan {MAX_EVENTS_PER_BATCH} ta xato yuborilishi mumkin."
            )
        return value
