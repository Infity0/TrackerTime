from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import pytz
import uuid

db = SQLAlchemy()
MOSCOW_TZ = pytz.timezone('Europe/Moscow')


def get_current_time():
    """Получаем текущее время в московском часовом поясе"""
    return datetime.now(MOSCOW_TZ)


class User(UserMixin, db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    created_at = db.Column(db.DateTime, default=lambda: get_current_time())

    projects = db.relationship('Project', backref='user', lazy=True, cascade='all, delete-orphan')
    time_entries = db.relationship('TimeEntry', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Project(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    color = db.Column(db.String(7), default='#3498db')
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: get_current_time())
    is_active = db.Column(db.Boolean, default=True)

    time_entries = db.relationship('TimeEntry', backref='project', lazy=True, cascade='all, delete-orphan')


class TimeEntry(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    description = db.Column(db.String(300), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime)
    duration = db.Column(db.Interval)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.String(36), db.ForeignKey('project.id'))
    created_at = db.Column(db.DateTime, default=lambda: get_current_time())

    def calculate_duration(self):
        if self.end_time:
            # Конвертируем в московское время для расчета
            start_local = self.start_time.astimezone(MOSCOW_TZ) if self.start_time.tzinfo else MOSCOW_TZ.localize(
                self.start_time)
            end_local = self.end_time.astimezone(MOSCOW_TZ) if self.end_time.tzinfo else MOSCOW_TZ.localize(
                self.end_time)
            self.duration = end_local - start_local
        return self.duration

    def get_local_start_time(self):
        """Возвращает start_time в локальном времени"""
        if self.start_time.tzinfo:
            return self.start_time.astimezone(MOSCOW_TZ)
        else:
            return MOSCOW_TZ.localize(self.start_time)

    def get_local_end_time(self):
        """Возвращает end_time в локальном времени"""
        if self.end_time:
            if self.end_time.tzinfo:
                return self.end_time.astimezone(MOSCOW_TZ)
            else:
                return MOSCOW_TZ.localize(self.end_time)
        return None

    def to_dict(self):
        local_start = self.get_local_start_time()
        local_end = self.get_local_end_time()
        duration_display = self.format_duration_display()

        return {
            'id': self.id,
            'description': self.description,
            'start_time': local_start.isoformat(),
            'end_time': local_end.isoformat() if local_end else None,
            'duration': str(self.duration) if self.duration else None,
            'duration_display': duration_display,
            'project_id': self.project_id,
            'project_name': self.project.name if self.project else 'Без проекта',
            'project_color': self.project.color if self.project else '#95a5a6',
            'date_str': local_start.strftime('%Y-%m-%d'),
            'time_str': local_start.strftime('%H:%M'),
            'date_display': local_start.strftime('%d.%m.%Y'),
            'time_display': local_start.strftime('%H:%M'),
            'is_active': self.end_time is None
        }

    def format_duration_display(self):
        """Форматирует продолжительность для отображения"""
        if not self.duration:
            return "0:00"

        total_seconds = int(self.duration.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60

        if hours > 0:
            return f"{hours}:{minutes:02d}"
        else:
            return f"{minutes} мин"