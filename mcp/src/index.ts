import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {
  addTask,
  addTasks,
  archiveTask,
  deleteTask,
  getStats,
  listTags,
  listTasks,
  snoozeTask,
  unarchiveTask,
  updateTask
} from './store';

const SERVER_INFO = { name: 'gonow', version: '2.0.0' };

const recurrence = z.enum(['none', 'daily', 'weekly', 'monthly', 'weekdays', 'everyN']);

const taskFields = {
  title: z.string().describe('Task title'),
  date: z.string().optional().describe('Date YYYY-MM-DD; defaults to today'),
  time: z.string().optional().describe('Time HH:MM'),
  note: z.string().optional().describe('Optional note'),
  recurrence: recurrence.optional(),
  recurrenceInterval: z.number().optional().describe('Interval in days for recurrence=everyN (2-365)'),
  recurrenceDay: z.number().optional().describe('Anchor day 1-31 for monthly recurrence'),
  notify: z.boolean().optional().describe('false = no date/time and no reminders'),
  important: z.boolean().optional().describe('Mark the task as important'),
  tags: z.array(z.string()).optional().describe('Up to 5 tags')
};

const addTaskSchema = z.object(taskFields);

const addTasksSchema = z.object({
  tasks: z.array(addTaskSchema).describe('Array of task objects')
});

const updateTaskSchema = z.object({
  id: z.string().describe('Task id'),
  title: z.string().optional(),
  date: z.string().optional().describe('Date YYYY-MM-DD or null for none'),
  time: z.string().optional().describe('Time HH:MM or null'),
  note: z.string().optional(),
  recurrence: recurrence.optional(),
  recurrenceInterval: z.number().optional().describe('Interval in days for recurrence=everyN (2-365)'),
  recurrenceDay: z.number().optional().describe('Anchor day 1-31 for monthly recurrence'),
  notify: z.boolean().optional(),
  important: z.boolean().optional().describe('Mark the task as important'),
  tags: z.array(z.string()).optional().describe('Up to 5 tags'),
  done: z.boolean().optional()
});

const deleteTaskSchema = z.object({
  id: z.string().describe('Task id')
});

const listTasksSchema = z.object({
  date: z.string().optional().describe('Exact date, YYYY-MM-DD'),
  from: z.string().optional().describe('Range start date, YYYY-MM-DD (inclusive)'),
  to: z.string().optional().describe('Range end date, YYYY-MM-DD (inclusive)'),
  search: z.string().optional().describe('Case-insensitive text search in title and note'),
  include_done: z.boolean().optional().describe('Include completed tasks (default true)'),
  include_archived: z.boolean().optional().describe('Include archived tasks (default false)')
});

const completeTaskSchema = z.object({
  id: z.string().describe('Task id'),
  done: z.boolean().optional().describe('true = complete, false = reopen (default true)')
});

const snoozeTaskSchema = z.object({
  id: z.string().describe('Task id'),
  minutes: z.number().optional().describe('Snooze for this many minutes (1-1440, default 10)')
});

const archiveTaskSchema = z.object({
  id: z.string().describe('Task id')
});

const listTagsSchema = z.object({
  include_archived: z.boolean().optional().describe('Include archived tasks (default true)')
});

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function registerTools(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks from the Go, Now! app. Filters: exact date, date range (from/to), text search over title and note, include_done and include_archived.',
      inputSchema: listTasksSchema
    },
    async (args) => textResult(await listTasks(args))
  );

  server.registerTool(
    'add_task',
    {
      description:
        'Add a task to Go, Now!. Set notify=false to create an undated task with no deadline and no reminders.',
      inputSchema: addTaskSchema
    },
    async (args) => textResult(await addTask(args))
  );

  server.registerTool(
    'add_tasks',
    {
      description: 'Add several tasks at once to Go, Now!. Each item uses the same fields as add_task.',
      inputSchema: addTasksSchema
    },
    async (args) => textResult(await addTasks({ tasks: args.tasks }))
  );

  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task from Go, Now! by id.',
      inputSchema: deleteTaskSchema
    },
    async (args) => textResult(await deleteTask(args))
  );

  server.registerTool(
    'update_task',
    {
      description: 'Edit an existing task in Go, Now! by id. Only the provided fields are changed.',
      inputSchema: updateTaskSchema
    },
    async (args) => textResult(await updateTask(args))
  );

  server.registerTool(
    'complete_task',
    {
      description: 'Mark a task as completed, or reopen it with done=false.',
      inputSchema: completeTaskSchema
    },
    async (args) => textResult(await updateTask({ id: args.id, done: args.done !== false }))
  );

  server.registerTool(
    'snooze_task',
    {
      description: 'Snooze a task reminder for a number of minutes (default 10, max 1440).',
      inputSchema: snoozeTaskSchema
    },
    async (args) => textResult(await snoozeTask(args))
  );

  server.registerTool(
    'get_stats',
    {
      description: 'Get task counts: active, done, archived, today, overdue, undated, done today and done in the last 7 days.'
    },
    async () => textResult(await getStats())
  );

  server.registerTool(
    'list_tags',
    {
      description: 'List tags with task counts, optionally including archived tasks (default true).',
      inputSchema: listTagsSchema
    },
    async (args) => textResult(await listTags(args))
  );

  server.registerTool(
    'archive_task',
    {
      description: 'Move a task to the archive by id.',
      inputSchema: archiveTaskSchema
    },
    async (args) => textResult(await archiveTask(args))
  );

  server.registerTool(
    'restore_task',
    {
      description: 'Restore an archived task by id.',
      inputSchema: archiveTaskSchema
    },
    async (args) => textResult(await unarchiveTask(args))
  );
}

function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server);
  return server;
}

serveStdio(buildServer);
