from rest_framework import serializers


class ActivateSerializer(serializers.Serializer):
    license_key = serializers.CharField(max_length=40)


class ApplyOfflineTokenSerializer(serializers.Serializer):
    token = serializers.CharField()
