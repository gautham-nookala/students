require("dotenv").config({ path: "../.env.local" });
const { Sequelize, DataTypes, Op } = require("sequelize");

// Initialize Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
  }
);

// Define the StudentEvent model to represent student events in the database
const StudentEvent = sequelize.define(
  "StudentEvent",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    institutionId: DataTypes.INTEGER,
    userId: DataTypes.INTEGER,
    classId: DataTypes.INTEGER,
    taskId: DataTypes.STRING,
    action: DataTypes.STRING,
    client_time: DataTypes.FLOAT,
  },
  {
    tableName: "student_events",
    timestamps: false,
  }
);

/**
 * Calculates the time-on-task for each student.
 * @returns {Promise<Array>} A promise that resolves to an array of users and their total time-on-task.
 */
async function calculateTimeOnTask() {
  try {
    const events = await fetchStudentEvents();
    const { timeOnTask } = processEvents(events);
    return formatTimeOnTaskResult(timeOnTask);
  } catch (error) {
    console.error("Error calculating time on task:", error);
    throw error;
  }
}

/**
 * Fetches relevant student events from the database.
 * @returns {Promise<Array>} A promise that resolves to an array of student events.
 */
async function fetchStudentEvents() {
  return await StudentEvent.findAll({
    attributes: ["userId", "taskId", "action", "client_time"],
    where: {
      taskId: { [Op.ne]: null },
      client_time: { [Op.ne]: null, [Op.gt]: 0 },
      action: { [Op.in]: ["started", "finished", "paused", "unpaused"] },
    },
    order: [["id", "ASC"]],
  });
}

/**
 * Processes the list of events to calculate time-on-task.
 * @param {Array} events - The list of events to process.
 * @returns {Object} An object containing time-on-task data for each user.
 */
function processEvents(events) {
  const eventsJson = events.map((event) => event.toJSON());
  const timeOnTask = {}; // Stores the total time-on-task per user
  const activeSessions = {}; // Tracks active sessions for each user-task

  eventsJson.forEach((event) =>
    processEvent(event, activeSessions, timeOnTask)
  );

  return { timeOnTask };
}

/**
 * Processes a single event and updates session and time-on-task data accordingly.
 * @param {Object} event - The event to process.
 * @param {Object} activeSessions - The active sessions being tracked.
 * @param {Object} timeOnTask - The time-on-task data for each user.
 */
function processEvent(event, activeSessions, timeOnTask) {
  const { userId, taskId, action, client_time: clientTime } = event;
  const key = `${userId}-${taskId}`;

  if (action === "started") {
    startSession(key, clientTime, activeSessions);
  } else if (action === "paused") {
    pauseSession(key, clientTime, activeSessions);
  } else if (action === "unpaused") {
    unpauseSession(key, clientTime, activeSessions);
  } else if (action === "finished") {
    finishSession(key, clientTime, activeSessions, timeOnTask, userId);
  }
}

/**
 * Starts a new session for a user-task if none is active.
 * @param {string} key - The key representing the user-task combination.
 * @param {number} clientTime - The client timestamp of the event.
 * @param {Object} activeSessions - The active sessions being tracked.
 */
function startSession(key, clientTime, activeSessions) {
  if (!activeSessions[key]) {
    activeSessions[key] = {
      startTime: clientTime,
      pausedTime: 0,
      isPaused: false,
    };
  }
}

/**
 * Pauses the current active session for a user-task.
 * @param {string} key - The key representing the user-task combination.
 * @param {number} clientTime - The client timestamp of the event.
 * @param {Object} activeSessions - The active sessions being tracked.
 */
function pauseSession(key, clientTime, activeSessions) {
  if (activeSessions[key] && !activeSessions[key].isPaused) {
    activeSessions[key].isPaused = true;
    activeSessions[key].pauseStartTime = clientTime;
  }
}

/**
 * Unpauses the current active session for a user-task.
 * @param {string} key - The key representing the user-task combination.
 * @param {number} clientTime - The client timestamp of the event.
 * @param {Object} activeSessions - The active sessions being tracked.
 */
function unpauseSession(key, clientTime, activeSessions) {
  if (activeSessions[key] && activeSessions[key].isPaused) {
    const pauseDuration = clientTime - activeSessions[key].pauseStartTime;
    activeSessions[key].pausedTime += pauseDuration;
    activeSessions[key].isPaused = false;
  }
}

/**
 * Finishes the current active session for a user-task and updates the total time-on-task.
 * @param {string} key - The key representing the user-task combination.
 * @param {number} clientTime - The client timestamp of the event.
 * @param {Object} activeSessions - The active sessions being tracked.
 * @param {Object} timeOnTask - The time-on-task data for each user.
 * @param {number} userId - The ID of the user.
 */
function finishSession(key, clientTime, activeSessions, timeOnTask, userId) {
  if (activeSessions[key]) {
    const { startTime, pausedTime } = activeSessions[key];
    // if (clientTime > startTime && clientTime - startTime < 14400) { Max 4 hours per session
    if (clientTime > startTime && clientTime - startTime) {
      const sessionDuration = clientTime - startTime - pausedTime;
      if (!timeOnTask[userId]) {
        timeOnTask[userId] = 0;
      }
      timeOnTask[userId] += Math.max(0, sessionDuration);
    }
    delete activeSessions[key];
  }
}

/**
 * Formats the time-on-task result to be returned in a human-readable format.
 * @param {Object} timeOnTask - The time-on-task data for each user.
 * @returns {Array} An array of objects representing users and their total time-on-task.
 */
function formatTimeOnTaskResult(timeOnTask) {
  return Object.entries(timeOnTask).map(([userId, totalTimeOnTask]) => ({
    userId: parseInt(userId, 10),
    totalTimeOnTask: new Date(totalTimeOnTask * 1000)
      .toISOString()
      .substr(11, 8),
  }));
}

// Usage
calculateTimeOnTask()
  .then((results) => console.log(results))
  .catch((error) => console.error(error))
  .finally(() => sequelize.close());
