class ReportsApp {
    constructor() {
        this.currentData = null;
        this.charts = {};
        this.isLoading = false;
        this.currentReportType = 'overview';
        this.currentPeriod = 30;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadData();
    }

    bindEvents() {
        // Фильтры
        document.getElementById('period-select').addEventListener('change', (e) => {
            this.currentPeriod = parseInt(e.target.value);
            this.loadData();
        });

        // Тип отчета
        document.getElementById('report-type').addEventListener('change', (e) => {
            this.currentReportType = e.target.value;
            this.switchReportType();
        });

        // Кнопки
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadData();
        });

        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportReport();
        });

        // Переключение деталей
        document.getElementById('toggle-details').addEventListener('click', () => {
            this.toggleDetails();
        });
    }

    switchReportType() {
        // Скрываем все секции отчетов
        document.querySelectorAll('.report-section').forEach(section => {
            section.style.display = 'none';
        });

        // Показываем выбранную секцию
        const activeSection = document.getElementById(`${this.currentReportType}-report`);
        if (activeSection) {
            activeSection.style.display = 'block';
        }

        // Обновляем отображение для текущего типа отчета
        if (this.currentData) {
            this.renderCurrentReport();
        }
    }

    async loadData() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();
        this.hideError();
        this.hideContent();

        try {
            const response = await fetch(`/api/reports/data?days=${this.currentPeriod}`);
            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.renderAll();
                this.showContent();
            } else {
                throw new Error(result.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            console.error('Error loading report data:', error);
            this.showError('Ошибка загрузки данных: ' + error.message);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    renderAll() {
        if (!this.currentData) return;

        this.updatePeriodBadges();
        this.renderCurrentReport();
    }

    renderCurrentReport() {
        switch (this.currentReportType) {
            case 'projects':
                this.renderProjectsReport();
                break;
            case 'daily':
                this.renderDailyReport();
                break;
            case 'productivity':
                this.renderProductivityReport();
                break;
            default:
                this.renderOverviewReport();
                break;
        }
    }

    updatePeriodBadges() {
        const badges = document.querySelectorAll('.period-badge');
        badges.forEach(badge => {
            badge.textContent = `${this.currentPeriod} дней`;
        });
    }

    // Overview Report
    renderOverviewReport() {
        this.renderSummary('summary-cards');
        this.renderProjectsChart('projects-chart', 'projects-legend');
        this.renderDailyChart('daily-chart');
        this.renderHourlyChart('hourly-chart');
        this.renderWeeklyChart('weekly-chart');
        this.renderEntriesTable();
    }

    // Projects Report
    renderProjectsReport() {
        this.renderProjectsSummary();
        this.renderProjectsChart('projects-detail-chart', 'projects-detail-legend');
        this.renderProjectsProgressChart();
    }

    renderProjectsSummary() {
        const container = document.getElementById('projects-summary-cards');
        const projectData = this.currentData.project_data;

        if (!projectData || Object.keys(projectData).length === 0) {
            container.innerHTML = this.getNoDataHTML();
            return;
        }

        const projects = Object.entries(projectData)
            .sort((a, b) => b[1].hours - a[1].hours)
            .slice(0, 4);

        container.innerHTML = projects.map(([name, data], index) => `
            <div class="metric-card ${index === 0 ? 'primary' : 'secondary'}">
                <div class="metric-header">
                    <div class="metric-icon">📁</div>
                    <div class="metric-trend trend-up">${data.percentage}%</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${data.hours}ч</div>
                    <div class="metric-label">${this.truncateText(name, 20)}</div>
                    <div class="metric-description">${data.entries_count} записей</div>
                </div>
            </div>
        `).join('');
    }

    renderProjectsProgressChart() {
        const ctx = document.getElementById('projects-progress-chart');
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const projectData = this.currentData.project_data;

        if (this.charts.projectsProgress) {
            this.charts.projectsProgress.destroy();
        }

        const sortedProjects = Object.entries(projectData)
            .sort((a, b) => b[1].hours - a[1].hours)
            .slice(0, 8);

        const labels = sortedProjects.map(([name]) => this.truncateText(name, 15));
        const data = sortedProjects.map(([, data]) => data.hours);
        const colors = sortedProjects.map(([, data]) => data.color);

        this.charts.projectsProgress = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Часы по проектам',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(color => this.darkenColor(color)),
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Часы'
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                }
            }
        });
    }

    // Daily Report
    renderDailyReport() {
        this.renderDailySummary();
        this.renderDailyChart('daily-detail-chart');
        this.renderDailyTrendChart();
        this.renderDailyComparisonChart();
    }

    renderDailySummary() {
        const container = document.getElementById('daily-summary-cards');
        const dailyData = this.currentData.daily_data;
        const summary = this.currentData.summary;

        if (!dailyData || Object.keys(dailyData).length === 0) {
            container.innerHTML = this.getNoDataHTML();
            return;
        }

        const dailyHours = Object.values(dailyData).map(day => day.hours);
        const maxDay = Math.max(...dailyHours);
        const avgDay = dailyHours.reduce((a, b) => a + b, 0) / dailyHours.length;
        const activeDays = dailyHours.filter(hours => hours > 0).length;

        container.innerHTML = `
            <div class="metric-card primary">
                <div class="metric-header">
                    <div class="metric-icon">📈</div>
                    <div class="metric-trend trend-up">${maxDay}ч</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${maxDay}ч</div>
                    <div class="metric-label">Максимум в день</div>
                    <div class="metric-description">Самая продуктивная дата</div>
                </div>
            </div>

            <div class="metric-card secondary">
                <div class="metric-header">
                    <div class="metric-icon">📊</div>
                    <div class="metric-trend trend-neutral">${avgDay.toFixed(1)}ч</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${avgDay.toFixed(1)}ч</div>
                    <div class="metric-label">Среднее в день</div>
                    <div class="metric-description">Средняя дневная активность</div>
                </div>
            </div>

            <div class="metric-card success">
                <div class="metric-header">
                    <div class="metric-icon">✅</div>
                    <div class="metric-trend trend-up">${activeDays}</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${activeDays}</div>
                    <div class="metric-label">Активных дней</div>
                    <div class="metric-description">Дней с активностью</div>
                </div>
            </div>

            <div class="metric-card warning">
                <div class="metric-header">
                    <div class="metric-icon">📅</div>
                    <div class="metric-trend trend-neutral">${summary.total_days}</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.total_days}</div>
                    <div class="metric-label">Всего дней</div>
                    <div class="metric-description">В выбранном периоде</div>
                </div>
            </div>
        `;
    }

    renderDailyTrendChart() {
        const ctx = document.getElementById('daily-trend-chart');
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const dailyData = this.currentData.daily_data;

        if (this.charts.dailyTrend) {
            this.charts.dailyTrend.destroy();
        }

        const sortedDates = Object.keys(dailyData).sort();
        const data = sortedDates.map(date => dailyData[date].hours);

        // Простой расчет тренда
        const trendData = this.calculateTrend(data);

        this.charts.dailyTrend = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sortedDates.map(date => dailyData[date].display_date),
                datasets: [
                    {
                        label: 'Факт',
                        data: data,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Тренд',
                        data: trendData,
                        borderColor: '#e74c3c',
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderDailyComparisonChart() {
        const ctx = document.getElementById('daily-comparison-chart');
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const hourlyData = this.currentData.hourly_data;

        if (this.charts.dailyComparison) {
            this.charts.dailyComparison.destroy();
        }

        const labels = Object.keys(hourlyData);
        const data = Object.values(hourlyData);

        this.charts.dailyComparison = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Активность по часам',
                    data: data,
                    backgroundColor: 'rgba(155, 89, 182, 0.7)',
                    borderColor: '#9b59b6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Productivity Report
    renderProductivityReport() {
        this.renderProductivitySummary();
        this.renderHourlyChart('productivity-hourly-chart');
        this.renderWeeklyChart('productivity-weekly-chart');
        this.renderSessionStats();
    }

    renderProductivitySummary() {
        const container = document.getElementById('productivity-summary-cards');
        const summary = this.currentData.summary;

        container.innerHTML = `
            <div class="metric-card primary">
                <div class="metric-header">
                    <div class="metric-icon">⏱️</div>
                    <div class="metric-trend trend-up">${summary.total_hours}ч</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.total_hours}ч</div>
                    <div class="metric-label">Всего времени</div>
                    <div class="metric-description">Общая продуктивность</div>
                </div>
            </div>

            <div class="metric-card success">
                <div class="metric-header">
                    <div class="metric-icon">⏰</div>
                    <div class="metric-trend trend-up">${summary.avg_session_minutes}м</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.avg_session_minutes}м</div>
                    <div class="metric-label">Средняя сессия</div>
                    <div class="metric-description">Продолжительность фокуса</div>
                </div>
            </div>

            <div class="metric-card warning">
                <div class="metric-header">
                    <div class="metric-icon">🚀</div>
                    <div class="metric-trend trend-up">${summary.most_productive_hours}ч</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.most_productive_hours}ч</div>
                    <div class="metric-label">Рекорд дня</div>
                    <div class="metric-description">Максимальная продуктивность</div>
                </div>
            </div>

            <div class="metric-card secondary">
                <div class="metric-header">
                    <div class="metric-icon">📝</div>
                    <div class="metric-trend trend-neutral">${summary.total_entries}</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.total_entries}</div>
                    <div class="metric-label">Рабочих сессий</div>
                    <div class="metric-description">Всего записей времени</div>
                </div>
            </div>
        `;
    }

    renderSessionStats() {
        const container = document.getElementById('session-stats');
        const summary = this.currentData.summary;

        container.innerHTML = `
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-value">${(summary.total_entries / summary.total_days).toFixed(1)}</div>
                    <div class="metric-label">Сессий в день</div>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-value">${(summary.total_hours / summary.total_days).toFixed(1)}ч</div>
                    <div class="metric-label">Часов в день</div>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-value">${summary.total_days}</div>
                    <div class="metric-label">Дней с активностью</div>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-value">${Math.round((summary.total_days / this.currentPeriod) * 100)}%</div>
                    <div class="metric-label">Коэффициент активности</div>
                </div>
            </div>
        `;
    }

    // Common Chart Methods
    renderSummary(containerId) {
        const container = document.getElementById(containerId);
        const summary = this.currentData.summary;

        container.innerHTML = `
            <div class="metric-card primary">
                <div class="metric-header">
                    <div class="metric-icon">⏱️</div>
                    <div class="metric-trend trend-up">+12%</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.total_hours}ч</div>
                    <div class="metric-label">Всего времени</div>
                    <div class="metric-description">Общее количество отслеженного времени</div>

                    <div class="metric-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${Math.min((summary.total_hours / 40) * 100, 100)}%"></div>
                        </div>
                        <div class="progress-label">
                            <span>Цель: 40ч</span>
                            <span>${Math.round((summary.total_hours / 40) * 100)}%</span>
                        </div>
                    </div>
                </div>
                <div class="metric-footer">
                    <div class="metric-comparison">за ${summary.total_days} дней</div>
                    <div class="metric-sparkline"></div>
                </div>
            </div>

            <div class="metric-card secondary">
                <div class="metric-header">
                    <div class="metric-icon">📝</div>
                    <div class="metric-trend ${summary.total_entries > 0 ? 'trend-up' : 'trend-neutral'}">
                        ${summary.total_entries > 0 ? '+5%' : '0%'}
                    </div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.total_entries}</div>
                    <div class="metric-label">Записей</div>
                    <div class="metric-description">Количество рабочих сессий</div>
                </div>
                <div class="metric-footer">
                    <div class="metric-comparison">в среднем ${(summary.total_entries / summary.total_days).toFixed(1)} в день</div>
                    <div class="metric-sparkline"></div>
                </div>
            </div>

            <div class="metric-card success">
                <div class="metric-header">
                    <div class="metric-icon">⏰</div>
                    <div class="metric-trend ${summary.avg_session_minutes > 30 ? 'trend-up' : 'trend-neutral'}">
                        ${summary.avg_session_minutes > 30 ? '+8%' : '0%'}
                    </div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.avg_session_minutes}м</div>
                    <div class="metric-label">Средняя сессия</div>
                    <div class="metric-description">Средняя продолжительность работы</div>
                </div>
                <div class="metric-footer">
                    <div class="metric-comparison">оптимальная фокусировка</div>
                    <div class="metric-sparkline"></div>
                </div>
            </div>

            <div class="metric-card warning featured">
                <div class="metric-header">
                    <div class="metric-icon">🚀</div>
                    <div class="metric-trend trend-up">+15%</div>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${summary.most_productive_hours}ч</div>
                    <div class="metric-label">Самый продуктивный день</div>
                    <div class="metric-description">Максимальное количество работы за день</div>

                    <div class="metric-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${(summary.most_productive_hours / 8) * 100}%"></div>
                        </div>
                        <div class="progress-label">
                            <span>Идеал: 8ч</span>
                            <span>${Math.round((summary.most_productive_hours / 8) * 100)}%</span>
                        </div>
                    </div>
                </div>
                <div class="metric-footer">
                    <div class="metric-comparison">активных дней: ${summary.total_days}</div>
                    <div class="metric-sparkline"></div>
                </div>
            </div>
        `;
    }

    renderProjectsChart(canvasId, legendId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const projectData = this.currentData.project_data;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        if (!projectData || Object.keys(projectData).length === 0) {
            return;
        }

        const labels = Object.keys(projectData);
        const data = labels.map(label => projectData[label].hours);
        const backgroundColors = labels.map(label => projectData[label].color);

        this.renderProjectsLegend(projectData, legendId);

        this.charts[canvasId] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 4,
                    hoverBorderColor: '#f8f9fa'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const percentage = projectData[label]?.percentage || 0;
                                return `${label}: ${value} ч (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }

    renderProjectsLegend(projectData, legendId) {
        const legendContainer = document.getElementById(legendId);
        if (!legendContainer) return;

        const entries = Object.entries(projectData).sort((a, b) => b[1].hours - a[1].hours);

        legendContainer.innerHTML = entries.map(([name, data]) => `
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${data.color}"></span>
                <span class="legend-label">${name}</span>
                <span class="legend-value">${data.hours} ч (${data.percentage}%)</span>
            </div>
        `).join('');
    }

    renderDailyChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const dailyData = this.currentData.daily_data;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        if (!dailyData || Object.keys(dailyData).length === 0) {
            return;
        }

        const sortedDates = Object.keys(dailyData).sort();
        const labels = sortedDates.map(date => dailyData[date].display_date);
        const data = sortedDates.map(date => dailyData[date].hours);

        this.charts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Часы работы',
                    data: data,
                    backgroundColor: 'rgba(52, 152, 219, 0.8)',
                    borderColor: '#3498db',
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Часы'
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                }
            }
        });
    }

    renderHourlyChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const hourlyData = this.currentData.hourly_data;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const labels = Object.keys(hourlyData);
        const data = Object.values(hourlyData);

        this.charts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Активность по часам',
                    data: data,
                    backgroundColor: 'rgba(155, 89, 182, 0.2)',
                    borderColor: '#9b59b6',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#9b59b6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Часы'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Часы дня'
                        }
                    }
                }
            }
        });
    }

    renderWeeklyChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const canvas = ctx.getContext('2d');
        const weeklyData = this.currentData.weekly_data;

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        if (!weeklyData || Object.keys(weeklyData).length === 0) {
            return;
        }

        const sortedWeeks = Object.keys(weeklyData).sort();
        const labels = sortedWeeks.map(week => weeklyData[week].display_name);
        const data = sortedWeeks.map(week => weeklyData[week].hours);

        this.charts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Часы в неделю',
                    data: data,
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderColor: '#2ecc71',
                    borderWidth: 4,
                    tension: 0.3,
                    pointBackgroundColor: '#2ecc71',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 3,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Часы'
                        }
                    }
                }
            }
        });
    }

    renderEntriesTable() {
        const tbody = document.getElementById('entries-tbody');
        const entries = this.currentData.detailed_entries;
        const countElement = document.getElementById('entries-count');
        const noDataMessage = document.getElementById('no-entries-message');

        if (!tbody || !countElement || !noDataMessage) return;

        countElement.textContent = entries.length;

        if (entries.length === 0) {
            tbody.innerHTML = '';
            noDataMessage.style.display = 'block';
            return;
        }

        noDataMessage.style.display = 'none';

        tbody.innerHTML = entries.map(entry => `
            <tr>
                <td class="date-cell">
                    <div class="date-display">${entry.date_display}</div>
                </td>
                <td class="time-cell">
                    <div class="time-display">${entry.time_display}</div>
                </td>
                <td class="project-cell">
                    <span class="project-badge" style="background-color: ${entry.project_color}">
                        ${entry.project_name}
                    </span>
                </td>
                <td class="description-cell">
                    <div class="description-text">${this.escapeHtml(entry.description)}</div>
                </td>
                <td class="duration-cell text-right">
                    <div class="duration-badge">${entry.duration_display}</div>
                </td>
            </tr>
        `).join('');
    }

    // Utility Methods
    calculateTrend(data) {
        if (data.length < 2) return data;

        const n = data.length;
        const x = Array.from({length: n}, (_, i) => i);
        const y = data;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, _, i) => sum + x[i] * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return x.map(xi => slope * xi + intercept);
    }

    darkenColor(color) {
        const hex = color.replace('#', '');
        const num = parseInt(hex, 16);
        const amt = -30;
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    getNoDataHTML() {
        return `
            <div class="no-data-state">
                <h3>Нет данных за выбранный период</h3>
                <p>Начните отслеживать время, чтобы увидеть здесь статистику</p>
            </div>
        `;
    }

    toggleDetails() {
        const content = document.getElementById('details-content');
        const button = document.getElementById('toggle-details');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            button.textContent = 'Свернуть';
        } else {
            content.style.display = 'none';
            button.textContent = 'Развернуть';
        }
    }

    async exportReport() {
        try {
            const response = await fetch(`/api/reports/export?days=${this.currentPeriod}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `time_report_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                throw new Error('Ошибка при экспорте');
            }
        } catch (error) {
            this.showError('Не удалось экспортировать отчет');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading() {
        const loading = document.getElementById('loading-indicator');
        if (loading) loading.style.display = 'flex';
    }

    hideLoading() {
        const loading = document.getElementById('loading-indicator');
        if (loading) loading.style.display = 'none';
    }

    showContent() {
        const content = document.getElementById('reports-content');
        if (content) content.style.display = 'block';
    }

    hideContent() {
        const content = document.getElementById('reports-content');
        if (content) content.style.display = 'none';
    }

    showError(message) {
        const error = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        if (error && errorText) {
            errorText.textContent = message;
            error.style.display = 'flex';
        }
    }

    hideError() {
        const error = document.getElementById('error-message');
        if (error) error.style.display = 'none';
    }
}

// Инициализация приложения
let reportsApp;

document.addEventListener('DOMContentLoaded', () => {
    reportsApp = new ReportsApp();
});