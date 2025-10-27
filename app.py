from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, Response
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, Project, TimeEntry, get_current_time, MOSCOW_TZ
from datetime import datetime, timedelta
import json
import csv
from io import StringIO

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///time_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Пожалуйста, войдите в систему для доступа к этой странице.'


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(user_id)


# ==================== АУТЕНТИФИКАЦИЯ ====================

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('login.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            login_user(user)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('dashboard'))
        else:
            flash('Неверное имя пользователя или пароль', 'error')

    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if password != confirm_password:
            flash('Пароли не совпадают', 'error')
            return render_template('register.html')

        if User.query.filter_by(username=username).first():
            flash('Имя пользователя уже занято', 'error')
            return render_template('register.html')

        if User.query.filter_by(email=email).first():
            flash('Email уже используется', 'error')
            return render_template('register.html')

        user = User(username=username, email=email)
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        flash('Регистрация успешна! Теперь вы можете войти.', 'success')
        return redirect(url_for('login'))

    return render_template('register.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Вы вышли из системы', 'success')
    return redirect(url_for('login'))


# ==================== ГЛАВНАЯ СТРАНИЦА ====================

@app.route('/dashboard')
@login_required
def dashboard():
    # Получаем активные проекты
    projects = Project.query.filter_by(user_id=current_user.id, is_active=True).all()

    # Получаем записи за сегодня (в локальном времени)
    today = get_current_time().date()
    all_entries = TimeEntry.query.filter_by(user_id=current_user.id).all()

    # Фильтруем записи за сегодня
    today_entries = []
    for entry in all_entries:
        local_start = entry.get_local_start_time()
        if local_start.date() == today and entry.end_time:
            today_entries.append(entry)

    # Считаем общее время за сегодня
    total_duration = sum(
        (entry.duration.total_seconds() for entry in today_entries if entry.duration),
        0
    )

    # Получаем активный таймер
    active_timer = TimeEntry.query.filter_by(user_id=current_user.id, end_time=None).first()

    return render_template('dashboard.html',
                           projects=projects,
                           today_entries=today_entries,
                           total_duration=total_duration,
                           active_timer=active_timer,
                           current_time=get_current_time())


# ==================== ТАЙМЕР ====================

@app.route('/api/timer/start', methods=['POST'])
@login_required
def api_timer_start():
    data = request.get_json()
    description = data.get('description', '').strip()
    project_id = data.get('project_id')

    if not description:
        return jsonify({'success': False, 'error': 'Описание не может быть пустым'})

    # Останавливаем все активные таймеры
    active_timers = TimeEntry.query.filter_by(user_id=current_user.id, end_time=None).all()
    for timer in active_timers:
        timer.end_time = get_current_time()
        timer.calculate_duration()

    # Создаем новую запись
    new_entry = TimeEntry(
        description=description,
        start_time=get_current_time(),
        user_id=current_user.id,
        project_id=project_id if project_id else None
    )

    db.session.add(new_entry)
    db.session.commit()

    return jsonify({'success': True, 'entry_id': new_entry.id})


@app.route('/api/timer/stop', methods=['POST'])
@login_required
def api_timer_stop():
    active_timer = TimeEntry.query.filter_by(user_id=current_user.id, end_time=None).first()

    if active_timer:
        active_timer.end_time = get_current_time()
        active_timer.calculate_duration()
        db.session.commit()

        entry_data = active_timer.to_dict()
        return jsonify({
            'success': True,
            'duration': entry_data['duration_display'],
            'entry': entry_data
        })

    return jsonify({'success': False, 'error': 'Активный таймер не найден'})


@app.route('/api/timer/active')
@login_required
def api_timer_active():
    active_timer = TimeEntry.query.filter_by(user_id=current_user.id, end_time=None).first()

    if active_timer:
        return jsonify({
            'success': True,
            'timer': active_timer.to_dict()
        })

    return jsonify({'success': False})


@app.route('/api/entries/today')
@login_required
def api_entries_today():
    today = get_current_time().date()
    all_entries = TimeEntry.query.filter_by(user_id=current_user.id).all()

    # Фильтруем записи за сегодня
    today_entries = []
    for entry in all_entries:
        local_start = entry.get_local_start_time()
        if local_start.date() == today and entry.end_time:
            today_entries.append(entry)

    # Сортируем по времени начала (новые сверху)
    today_entries.sort(key=lambda x: x.get_local_start_time(), reverse=True)

    return jsonify({
        'success': True,
        'entries': [entry.to_dict() for entry in today_entries]
    })


# ==================== ПРОЕКТЫ ====================

@app.route('/projects')
@login_required
def projects():
    user_projects = Project.query.filter_by(user_id=current_user.id).order_by(Project.created_at.desc()).all()
    return render_template('projects.html', projects=user_projects)


@app.route('/api/projects/create', methods=['POST'])
@login_required
def api_projects_create():
    name = request.form.get('name')
    description = request.form.get('description')
    color = request.form.get('color', '#3498db')

    if not name:
        return jsonify({'success': False, 'error': 'Название проекта не может быть пустым'})

    project = Project(
        name=name,
        description=description,
        color=color,
        user_id=current_user.id
    )

    db.session.add(project)
    db.session.commit()

    return jsonify({'success': True, 'project_id': project.id})


@app.route('/api/projects/<project_id>/delete', methods=['POST'])
@login_required
def api_projects_delete(project_id):
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first()

    if project:
        db.session.delete(project)
        db.session.commit()
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'Проект не найден'})


# ==================== ОТЧЕТЫ ====================

@app.route('/reports')
@login_required
def reports():
    return render_template('reports.html')


@app.route('/api/reports/data')
@login_required
def api_reports_data():
    try:
        days = int(request.args.get('days', 7))
        report_data = generate_report_data(current_user.id, days)

        return jsonify({
            'success': True,
            'data': report_data
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@app.route('/api/reports/export')
@login_required
def api_reports_export():
    try:
        days = int(request.args.get('days', 7))
        report_data = generate_report_data(current_user.id, days)

        output = StringIO()
        writer = csv.writer(output)

        # Заголовок
        writer.writerow(['Отчет по учету времени', f'Период: последние {days} дней'])
        writer.writerow(['Сгенерирован', get_current_time().strftime('%d.%m.%Y %H:%M')])
        writer.writerow([])
        writer.writerow(['Сводная статистика'])
        writer.writerow(['Общее время', f"{report_data['summary']['total_hours']} часов"])
        writer.writerow(['Количество записей', report_data['summary']['total_entries']])
        writer.writerow(['Средняя продолжительность', f"{report_data['summary']['avg_session_minutes']} минут"])
        writer.writerow(['Количество дней с активностью', report_data['summary']['total_days']])
        writer.writerow(['Самый продуктивный день', f"{report_data['summary']['most_productive_hours']} часов"])
        writer.writerow([])

        # По проектам
        writer.writerow(['Распределение по проектам'])
        writer.writerow(['Проект', 'Часы', 'Процент'])
        for project_name, data in report_data['project_data'].items():
            writer.writerow([project_name, data['hours'], f"{data['percentage']}%"])
        writer.writerow([])

        # Детальные записи
        writer.writerow(['Детальные записи'])
        writer.writerow(['Дата', 'Время начала', 'Описание', 'Проект', 'Продолжительность'])

        for entry in report_data['detailed_entries']:
            writer.writerow([
                entry['date_display'],
                entry['time_display'],
                entry['description'],
                entry['project_name'],
                entry['duration_display']
            ])

        output.seek(0)
        filename = f"time_report_{get_current_time().strftime('%Y-%m-%d_%H-%M')}.csv"

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


def generate_report_data(user_id, days):
    """Генерирует данные для отчета"""
    end_date = get_current_time()
    start_date = end_date - timedelta(days=days)

    # Получаем все записи пользователя
    all_entries = TimeEntry.query.filter_by(user_id=user_id).all()

    # Фильтруем по дате начала в локальном времени
    filtered_entries = []
    for entry in all_entries:
        local_start = entry.get_local_start_time()
        if local_start >= start_date and entry.end_time:
            filtered_entries.append(entry)

    # Собираем статистику
    summary = calculate_summary_statistics(filtered_entries)
    project_data = calculate_project_statistics(filtered_entries)
    daily_data = calculate_daily_statistics(filtered_entries, days, start_date, end_date)
    weekly_data = calculate_weekly_statistics(filtered_entries)
    hourly_data = calculate_hourly_statistics(filtered_entries)

    # Подготавливаем детальные записи
    detailed_entries = []
    for entry in filtered_entries[:100]:  # Ограничиваем количество
        detailed_entries.append(entry.to_dict())

    return {
        'summary': summary,
        'project_data': project_data,
        'daily_data': daily_data,
        'weekly_data': weekly_data,
        'hourly_data': hourly_data,
        'detailed_entries': detailed_entries,
        'period': {
            'days': days,
            'start_date': start_date.strftime('%d.%m.%Y'),
            'end_date': end_date.strftime('%d.%m.%Y')
        }
    }


def calculate_summary_statistics(entries):
    """Рассчитывает сводную статистику"""
    if not entries:
        return {
            'total_hours': 0,
            'total_entries': 0,
            'avg_session_minutes': 0,
            'most_productive_hours': 0,
            'total_days': 0
        }

    total_seconds = sum(entry.duration.total_seconds() for entry in entries if entry.duration)
    total_entries = len(entries)

    avg_session_seconds = total_seconds / total_entries if total_entries > 0 else 0

    # Самый продуктивный день
    daily_totals = {}
    for entry in entries:
        date_str = entry.get_local_start_time().strftime('%Y-%m-%d')
        seconds = entry.duration.total_seconds() if entry.duration else 0
        daily_totals[date_str] = daily_totals.get(date_str, 0) + seconds

    most_productive_day = max(daily_totals.values()) if daily_totals else 0

    return {
        'total_hours': round(total_seconds / 3600, 2),
        'total_entries': total_entries,
        'avg_session_minutes': round(avg_session_seconds / 60, 1),
        'most_productive_hours': round(most_productive_day / 3600, 2),
        'total_days': len(daily_totals)
    }


def calculate_project_statistics(entries):
    """Статистика по проектам"""
    project_data = {}

    for entry in entries:
        project_name = entry.project.name if entry.project else 'Без проекта'
        project_color = entry.project.color if entry.project else '#95a5a6'
        duration_seconds = entry.duration.total_seconds() if entry.duration else 0

        if project_name not in project_data:
            project_data[project_name] = {
                'total_seconds': 0,
                'color': project_color,
                'entries_count': 0
            }

        project_data[project_name]['total_seconds'] += duration_seconds
        project_data[project_name]['entries_count'] += 1

    # Конвертируем в часы и добавляем проценты
    total_seconds = sum(data['total_seconds'] for data in project_data.values())

    for project_name, data in project_data.items():
        hours = data['total_seconds'] / 3600
        percentage = (data['total_seconds'] / total_seconds * 100) if total_seconds > 0 else 0

        project_data[project_name]['hours'] = round(hours, 2)
        project_data[project_name]['percentage'] = round(percentage, 1)

    return project_data


def calculate_daily_statistics(entries, days, start_date, end_date):
    """Статистика по дням"""
    daily_data = {}

    # Инициализируем все дни в периоде
    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.strftime('%Y-%m-%d')
        daily_data[date_str] = {
            'total_seconds': 0,
            'display_date': current_date.strftime('%d.%m'),
            'entries_count': 0,
            'hours': 0
        }
        current_date += timedelta(days=1)

    # Заполняем реальными данными
    for entry in entries:
        date_str = entry.get_local_start_time().strftime('%Y-%m-%d')
        if date_str in daily_data:
            seconds = entry.duration.total_seconds() if entry.duration else 0
            daily_data[date_str]['total_seconds'] += seconds
            daily_data[date_str]['entries_count'] += 1
            daily_data[date_str]['hours'] = round(daily_data[date_str]['total_seconds'] / 3600, 2)

    return daily_data


def calculate_weekly_statistics(entries):
    """Статистика по неделям"""
    weekly_data = {}

    for entry in entries:
        local_start = entry.get_local_start_time()
        year, week, _ = local_start.isocalendar()
        week_key = f"{year}-W{week:02d}"

        seconds = entry.duration.total_seconds() if entry.duration else 0

        if week_key not in weekly_data:
            weekly_data[week_key] = {
                'total_seconds': 0,
                'display_name': f"{week} неделя",
                'entries_count': 0,
                'hours': 0
            }

        weekly_data[week_key]['total_seconds'] += seconds
        weekly_data[week_key]['entries_count'] += 1
        weekly_data[week_key]['hours'] = round(weekly_data[week_key]['total_seconds'] / 3600, 2)

    return weekly_data


def calculate_hourly_statistics(entries):
    """Статистика по часам дня"""
    hourly_data = {f"{i:02d}": 0 for i in range(24)}

    for entry in entries:
        hour = entry.get_local_start_time().hour
        hour_key = f"{hour:02d}"
        seconds = entry.duration.total_seconds() if entry.duration else 0
        hourly_data[hour_key] += seconds

    # Конвертируем в часы
    for hour, seconds in hourly_data.items():
        hourly_data[hour] = round(seconds / 3600, 2)

    return hourly_data


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)