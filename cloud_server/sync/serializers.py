from rest_framework import serializers


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
