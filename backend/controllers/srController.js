const fs = require('fs');
const path = require('path');
const { SCHEDULE_FILE } = require('../config/limits');

const scheduleFile = path.resolve(__dirname, SCHEDULE_FILE);

function readSchedule() {
  if (!fs.existsSync(scheduleFile)) return { tasks: [] };
  return JSON.parse(fs.readFileSync(scheduleFile, 'utf-8'));
}

function writeSchedule(data) {
  fs.writeFileSync(scheduleFile, JSON.stringify(data, null, 2));
}

function getTodayTasks() {
  const { tasks } = readSchedule();
  const today = new Date().toISOString().split('T')[0];
  return tasks.filter((t) => t.dueDate === today && !t.completed);
}

function completeTask(taskId, quality) {
  const schedule = readSchedule();
  const task = schedule.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('משימה לא נמצאה');
  // חישוב מרווח חזרה פשוט (SM-2 יוטמע בשלב הבא)
  task.completed = true;
  task.lastReviewed = new Date().toISOString();
  writeSchedule(schedule);
  return task;
}

module.exports = { getTodayTasks, completeTask, readSchedule, writeSchedule };
