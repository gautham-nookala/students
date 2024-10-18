require("dotenv").config({ path: ".env.local" });
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
 * Calculates the total time-on-task for each class.
 * @returns {Promise<Array>} A promise that resolves to an array of classes and their total time-on-task.
 */
async function calculateTimeOnTaskPerClass() {
  try {
    const events = await fetchStudentEvents();
    const { timeOnTask } = processEvents(events, "classId");
    return formatTimeOnTaskResult(timeOnTask);
  } catch (error) {
    console.error("Error calculating time on task per class:", error);
    throw error;
  }
}

/**
 * Fetches relevant student events from the database.
 * @returns {Promise<Array>} A promise that resolves to an array of student events.
 */
async function fetchStudentEvents() {
  return await StudentEvent.findAll({
    attributes: ["userId", "taskId", "action", "client_time", "classId"],
    where: {
      taskId: { [Op.ne]: null },
      client_time: { [Op.ne]: null, [Op.gt]: 0 },
      action: {
        [Op.in]: [
          "started",
          "finished",
          "application-paused",
          "application-unpaused",
        ],
      },
    },
    order: [["id", "ASC"]],
  });
}

/**
 * Processes the list of events to calculate time-on-task.
 * @param {Array} events - The list of events to process.
 * @param {string} idField - The identifier field to calculate time-on-task for ('classId').
 * @returns {Object} An object containing time-on-task data.
 */
function processEvents(events, idField) {
  const eventsJson = events.map((event) => event.toJSON());
  const timeOnTask = {}; // Stores the total time-on-task per identifier
  const activeSessions = {}; // Tracks active sessions for each identifier-task

  eventsJson.forEach((event) =>
    processEvent(event, activeSessions, timeOnTask, idField)
  );

  return { timeOnTask };
}

/**
 * Processes a single event and updates session and time-on-task data accordingly.
 * @param {Object} event - The event to process.
 * @param {Object} activeSessions - The active sessions being tracked.
 * @param {Object} timeOnTask - The time-on-task data for each identifier.
 */
function processEvent(event, activeSessions, timeOnTask) {
  const { classId, taskId, action, client_time: clientTime } = event;
  const id = classId;
  const key = `${id}-${taskId}`;

  if (action === "started") {
    startSession(key, clientTime, activeSessions);
  } else if (action === "application-paused") {
    pauseSession(key, clientTime, activeSessions);
  } else if (action === "application-unpaused") {
    unpauseSession(key, clientTime, activeSessions);
  } else if (action === "finished") {
    finishSession(key, clientTime, activeSessions, timeOnTask, id);
  }
}

/**
 * Starts a new session for a class-task if none is active.
 * @param {string} key - The key representing the identifier-task combination.
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
 * Pauses the current active session for a class-task.
 * @param {string} key - The key representing the identifier-task combination.
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
 * Unpauses the current active session for a class-task.
 * @param {string} key - The key representing the identifier-task combination.
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
 * Finishes the current active session for a class-task and updates the total time-on-task.
 * @param {string} key - The key representing the identifier-task combination.
 * @param {number} clientTime - The client timestamp of the event.
 * @param {Object} activeSessions - The active sessions being tracked.
 * @param {Object} timeOnTask - The time-on-task data for each identifier.
 * @param {number} id - The identifier (classId).
 */
function finishSession(key, clientTime, activeSessions, timeOnTask, id) {
  if (activeSessions[key]) {
    const { startTime, pausedTime } = activeSessions[key];
    if (clientTime > startTime && clientTime - startTime < 3600) {
      // Max 1 hour per session
      const sessionDuration = clientTime - startTime - pausedTime;
      if (!timeOnTask[id]) {
        timeOnTask[id] = 0;
      }
      timeOnTask[id] += Math.max(0, sessionDuration);
    }
    delete activeSessions[key];
  }
}

/**
 * Formats the time-on-task result to be returned in a human-readable format.
 * @param {Object} timeOnTask - The time-on-task data for each identifier.
 * @returns {Array} An array of objects representing identifiers and their total time-on-task.
 */
function formatTimeOnTaskResult(timeOnTask) {
  return Object.entries(timeOnTask).map(([id, totalTimeOnTask]) => ({
    id: parseInt(id, 10),
    totalTimeOnTask: new Date(totalTimeOnTask * 1000)
      .toISOString()
      .substr(11, 8),
  }));
}

// Usage example
calculateTimeOnTaskPerClass()
  .then((results) => {
    console.log("Class Time on Task:", results);
  })
  .catch((error) => console.error("Error:", error));
