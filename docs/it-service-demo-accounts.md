# IT repair service — demonstration accounts

The `it.employee` and `it.handler` permission sets, the three demonstration
accounts below, and three sample tickets are written by the seeds in
`database/main/seeds/`. They exist so the reporting and handling flow can be
tried on a fresh installation.

> This file is committed to the repository on purpose, so it is **not** part of
> the public demo report. Do not copy these credentials into a report, a
> screenshot, or any other user-facing place. Change or delete the accounts
> before a real deployment.

## Accounts

All three accounts share the password `ItDemo#2026`. Sign in with the username
or the email address.

| Username        | Email                    | Name | Permission set |
| --------------- | ------------------------ | ---- | -------------- |
| `employee.li`   | `li.jing@example.com`    | 李静 | `it.employee`  |
| `employee.wang` | `wang.qiang@example.com` | 王强 | `it.employee`  |
| `handler.chen`  | `chen.tao@example.com`   | 陈涛 | `it.handler`   |

- **Employees** see the IT repairs page, submit tickets, and read only their own
  tickets. They cannot start or complete a ticket.
- **A handler** sees every ticket and can start handling and complete one, but
  cannot submit a ticket.

## Sample tickets

| Title                | Category | Status      | Submitted by    | Handled by     |
| -------------------- | -------- | ----------- | --------------- | -------------- |
| 笔记本电脑无法开机   | Computer | Pending     | `employee.li`   | —              |
| 邮箱账号无法登录     | Account  | In progress | `employee.wang` | `handler.chen` |
| 办公软件提示授权过期 | Other    | Completed   | `employee.li`   | `handler.chen` |

## Giving the same access to a new colleague

The permission sets are ordinary application data, not code. A root
administrator assigns them through the Users page:

1. Open **Settings → Users**.
2. Create the user, or open an existing one.
3. Set the user's **role** to `IT employee` or `IT handler`. The two sets
   registered by this application appear in the role list beside the built-in
   roles.
4. Save. The user sees the **IT repairs** page on the next sign-in, with the
   matching data scope.

A colleague who should only be able to report and follow their own tickets
takes `IT employee`; a colleague who should handle every ticket takes
`IT handler`.
