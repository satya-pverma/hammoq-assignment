# On-camera explanation (about 3 minutes)

Use these as notes and adapt them to what you personally reviewed and understand.

## Introduction and demonstration

I built Tasklane, a private task manager using Next.js, TypeScript, MongoDB, and Google sign-in. I can create a task, set its priority and due date, edit it, mark it complete, and find it through search and filters. Refreshing the page preserves the task.

## Three important decisions

1. I kept the frontend and backend in one Next.js application. That keeps deployment on Vercel simple and gives me one codebase to maintain, while route handlers provide an explicit backend boundary.
2. I used Google sign-in instead of storing passwords. The backend gets ownership from the authenticated session, and includes that owner in every task query. Knowing another task's ID does not grant access to it.
3. I validated task input on the server and only update the screen after the database confirms success. That prevents invalid data and misleading success states. I also reuse a bounded MongoDB connection pool for serverless execution.

## Three things I deliberately left out

- Teams and sharing: I prioritized reliable personal task management; collaboration needs a larger permission model.
- Reminders and recurring tasks: these need background jobs, delivery services, and timezone decisions.
- Attachments and rich text: plain text meets the objective while avoiding file storage and upload security scope.

## One limitation

The current list loads all tasks for the signed-in user and filters them in the browser. With another day I would add server-side filtering and cursor pagination, then test large histories and page boundaries.

## Closing

Show the deployed application and repository. Mention the checks you actually ran and their results. Be transparent that this is production-oriented assessment code and still needs operational hardening for a public launch.
