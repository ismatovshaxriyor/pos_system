from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0006_syncedorder_syncedorderitem_syncedpayment'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurant',
            name='telegram_bot_token',
            field=models.CharField(blank=True, default='', help_text='Fail-safe Telegram bot tokeni', max_length=200),
        ),
        migrations.AddField(
            model_name='restaurant',
            name='telegram_chat_id',
            field=models.CharField(blank=True, default='', help_text='Fail-safe Telegram admin/group chat_id', max_length=100),
        ),
    ]
