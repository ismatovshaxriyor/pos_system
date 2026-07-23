import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0007_restaurant_telegram_bot_token_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='DemoRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('restaurant_name', models.CharField(max_length=200)),
                ('contact_name', models.CharField(max_length=200)),
                ('phone', models.CharField(max_length=50)),
                ('branch_count', models.CharField(blank=True, default='', max_length=50)),
                ('note', models.TextField(blank=True, default='')),
                ('is_contacted', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
