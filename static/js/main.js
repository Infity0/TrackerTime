// ==================== ТАЙМЕР ====================

let activeTimerInterval = null;
let activeTimerStartTime = null;

// Проверяем активный таймер при загрузке страницы
async function checkActiveTimer() {
    try {
        console.log('Checking for active timer...');
        const response = await fetch('/api/timer/active');
        const result = await response.json();

        if (result.success && result.timer) {
            console.log('Active timer found:', result.timer);
            const startTime = new Date(result.timer.start_time);
            startTimerDisplay(startTime);
            showActiveTimer(result.timer);
        } else {
            console.log('No active timer found');
        }
    } catch (error) {
        console.error('Error checking active timer:', error);
    }
}

// Запуск таймера
async function startTimer() {
    console.log('Start button clicked');

    const description = document.getElementById('task-description').value.trim();
    const projectSelect = document.getElementById('project-select');
    const projectId = projectSelect.value;

    console.log('Description:', description, 'Project ID:', projectId);

    if (!description) {
        alert('Пожалуйста, введите описание задачи');
        return;
    }

    try {
        const response = await fetch('/api/timer/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                description: description,
                project_id: projectId
            })
        });

        const result = await response.json();
        console.log('Start timer response:', result);

        if (result.success) {
            const startTime = new Date();
            startTimerDisplay(startTime);
            showActiveTimer({
                description: description,
                project_id: projectId,
                start_time: startTime.toISOString()
            });

            // Обновляем список записей
            setTimeout(updateTodayEntries, 1000);
        } else {
            alert('Ошибка: ' + result.error);
        }
    } catch (error) {
        console.error('Error starting timer:', error);
        alert('Ошибка при запуске таймера: ' + error.message);
    }
}

// Остановка таймера
async function stopTimer() {
    console.log('Stop button clicked');

    try {
        const response = await fetch('/api/timer/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }
        });

        const result = await response.json();
        console.log('Stop timer response:', result);

        if (result.success) {
            hideActiveTimer();
            updateTodayEntries();
            updateTodayTotal();
        } else {
            alert('Ошибка: ' + result.error);
        }
    } catch (error) {
        console.error('Error stopping timer:', error);
        alert('Ошибка при остановке таймера: ' + error.message);
    }
}

// Отображение активного таймера
function showActiveTimer(timerData) {
    console.log('Showing active timer:', timerData);

    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const taskInput = document.getElementById('task-description');
    const projectSelect = document.getElementById('project-select');

    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (taskInput) taskInput.disabled = true;
    if (projectSelect) projectSelect.disabled = true;

    const selectedOption = projectSelect ? projectSelect.options[projectSelect.selectedIndex] : null;
    const projectName = selectedOption ? selectedOption.text : 'Без проекта';
    const projectColor = selectedOption ? selectedOption.getAttribute('data-color') : '#95a5a6';

    const currentTask = document.getElementById('current-task');
    if (currentTask) {
        currentTask.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                <strong>Текущая задача:</strong>
                <span>${escapeHtml(timerData.description)}</span>
                <span style="color: ${projectColor}; font-weight: 500;">${projectName}</span>
            </div>
        `;
    }
}

// Скрытие активного таймера
function hideActiveTimer() {
    console.log('Hiding active timer');

    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const taskInput = document.getElementById('task-description');
    const projectSelect = document.getElementById('project-select');
    const currentTask = document.getElementById('current-task');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (taskInput) {
        taskInput.disabled = false;
        taskInput.value = '';
    }
    if (projectSelect) projectSelect.disabled = false;
    if (currentTask) currentTask.innerHTML = '';

    if (activeTimerInterval) {
        clearInterval(activeTimerInterval);
        activeTimerInterval = null;
    }

    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.textContent = '00:00:00';
}

// Обновление отображения таймера
function startTimerDisplay(startTime) {
    console.log('Starting timer display with time:', startTime);

    if (!startTime) {
        startTime = new Date();
    }

    activeTimerStartTime = startTime;

    const updateDisplay = () => {
        const now = new Date();
        const diff = now - activeTimerStartTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = display;
        }
    };

    updateDisplay();

    // Очищаем предыдущий интервал если есть
    if (activeTimerInterval) {
        clearInterval(activeTimerInterval);
    }

    activeTimerInterval = setInterval(updateDisplay, 1000);
}

// ==================== ЗАПИСИ ====================

// Обновление списка записей за сегодня
async function updateTodayEntries() {
    try {
        console.log('Updating today entries...');
        const response = await fetch('/api/entries/today');
        const result = await response.json();

        if (result.success) {
            renderEntriesList(result.entries);
        }
    } catch (error) {
        console.error('Error fetching entries:', error);
    }
}

// Отрисовка списка записей
function renderEntriesList(entries) {
    const entriesList = document.getElementById('entries-list');
    if (!entriesList) return;

    console.log('Rendering entries:', entries);

    if (!entries || entries.length === 0) {
        entriesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>Нет записей за сегодня</h3>
                <p>Запустите таймер, чтобы начать отслеживать время</p>
            </div>
        `;
        return;
    }

    entriesList.innerHTML = entries.map(entry => `
        <div class="entry-item">
            <span class="entry-project" style="background-color: ${entry.project_color || '#95a5a6'}"></span>
            <div class="entry-content">
                <div class="entry-description">${escapeHtml(entry.description)}</div>
                <div class="entry-meta">
                    <span class="entry-time">${entry.time_display || '00:00'}</span>
                    <span class="entry-duration">${entry.duration_display || '0:00'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Обновление общего времени за сегодня
async function updateTodayTotal() {
    try {
        const response = await fetch('/api/entries/today');
        const result = await response.json();

        if (result.success) {
            const totalSeconds = result.entries.reduce((total, entry) => {
                if (entry.duration) {
                    const parts = entry.duration.split(':');
                    if (parts.length === 3) {
                        return total + parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                    }
                }
                return total;
            }, 0);

            const totalHours = (totalSeconds / 3600).toFixed(2);
            const todayTotal = document.getElementById('today-total');
            if (todayTotal) {
                todayTotal.textContent = `${totalHours} ч`;
            }
        }
    } catch (error) {
        console.error('Error updating today total:', error);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Получение CSRF токена
function getCSRFToken() {
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    return csrfToken ? csrfToken.getAttribute('content') : '';
}

// Экранирование HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Форматирование продолжительности
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    } else {
        return `${minutes} мин`;
    }
}

// Обновление текущего времени
function startCurrentTimeUpdater() {
    setInterval(() => {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU');
        const dateString = now.toLocaleDateString('ru-RU');
        const currentTimeElement = document.getElementById('current-time');
        if (currentTimeElement) {
            currentTimeElement.textContent = `${dateString} ${timeString}`;
        }
    }, 1000);
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing timer...');

    // Инициализация таймера
    checkActiveTimer();

    // Запуск обновления текущего времени
    startCurrentTimeUpdater();

    // Обработчики для кнопок таймера
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const refreshBtn = document.getElementById('refresh-entries');

    if (startBtn) {
        console.log('Start button found, adding event listener');
        startBtn.addEventListener('click', startTimer);
    } else {
        console.error('Start button not found!');
    }

    if (stopBtn) {
        console.log('Stop button found, adding event listener');
        stopBtn.addEventListener('click', stopTimer);
    }

    if (refreshBtn) {
        console.log('Refresh button found, adding event listener');
        refreshBtn.addEventListener('click', updateTodayEntries);
    }

    // Обработка Enter в поле описания задачи
    const taskInput = document.getElementById('task-description');
    if (taskInput) {
        taskInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                startTimer();
            }
        });
    }

    // Автоматическое обновление записей каждые 30 секунд
    setInterval(updateTodayEntries, 30000);

    // Первоначальная загрузка записей
    setTimeout(updateTodayEntries, 1000);
});