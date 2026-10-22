import bcrypt from 'bcryptjs'
import { pool, withTransaction } from './db.js'

const password = process.env.DEMO_USER_PASSWORD

const demoUsers = [
  {
    email: 'user1@tasktracker.local',
    name: 'Nguyễn Minh Anh',
    focus: 'dự án học tập và kế hoạch cá nhân',
    tasks: [
      'Hoàn thiện báo cáo tuần', 'Thiết kế giao diện đăng nhập', 'Ôn tập cấu trúc dữ liệu',
      'Kiểm tra chức năng quản lý công việc', 'Viết tài liệu dự án', 'Sửa lỗi giao diện mobile',
      'Chuẩn bị kế hoạch học tập', 'Tổng hợp góp ý cho sản phẩm', 'Cập nhật lịch ôn thi',
      'Bổ sung kiểm thử cho API', 'Rà soát nội dung thuyết trình', 'Hoàn thành bài tập nhóm',
      'Chuẩn bị bài trình bày', 'Đọc tài liệu thiết kế sản phẩm', 'Nộp báo cáo môn học',
      'Xác minh lỗi đồng bộ dữ liệu', 'Hoàn thiện kế hoạch sprint', 'Tạo bản nháp portfolio',
      'Lên lịch họp nhóm', 'Đọc chương tiếp theo', 'Kiểm tra dữ liệu cơ sở dữ liệu',
      'Tổng kết công việc trong tuần', 'Chuẩn bị ghi chú buổi học', 'Lập danh sách việc tuần mới',
    ],
  },
  {
    email: 'user2@tasktracker.local',
    name: 'Trần Hoàng Nam',
    focus: 'dự án phần mềm và phối hợp nhóm',
    tasks: [
      'Phân tích yêu cầu sản phẩm', 'Phác thảo luồng đăng nhập', 'Ôn tập truy vấn PostgreSQL',
      'Tích hợp API danh sách công việc', 'Viết hướng dẫn cài đặt dự án', 'Kiểm tra bố cục trên điện thoại',
      'Lập kế hoạch kiểm thử tuần', 'Phân loại phản hồi người dùng', 'Cập nhật sơ đồ cơ sở dữ liệu',
      'Bổ sung xác thực cho endpoint', 'Chuẩn bị demo sprint', 'Hoàn tất review pull request',
      'Tối ưu truy vấn trang tổng quan', 'Đọc tài liệu triển khai', 'Gửi biên bản họp nhóm',
      'Điều tra lỗi phân trang', 'Cập nhật checklist phát hành', 'Tạo mẫu dữ liệu kiểm thử',
      'Phân công đầu việc tuần tới', 'Viết test cho bộ lọc', 'Đối chiếu dữ liệu migration',
      'Tổng hợp tiến độ sprint', 'Chuẩn bị môi trường demo', 'Rà soát backlog dự án',
    ],
  },
  {
    email: 'user3@tasktracker.local',
    name: 'Lê Thu Hà',
    focus: 'nghiên cứu, nội dung và trải nghiệm người dùng',
    tasks: [
      'Lập đề cương nghiên cứu người dùng', 'Thiết kế bộ câu hỏi phỏng vấn', 'Hoàn thiện nội dung trang chủ',
      'Tổng hợp kết quả khảo sát', 'Viết tài liệu hướng dẫn sử dụng', 'Rà soát khả năng đọc trên mobile',
      'Chuẩn bị lịch phỏng vấn', 'Phân nhóm góp ý trải nghiệm', 'Cập nhật nội dung onboarding',
      'Kiểm tra thông báo lỗi biểu mẫu', 'Hoàn thiện bản trình bày nghiên cứu', 'Chỉnh sửa mô tả tính năng',
      'Đối chiếu hành trình người dùng', 'Đọc tài liệu accessibility', 'Gửi báo cáo khảo sát',
      'Xác minh lỗi điều hướng trang', 'Lập kế hoạch nội dung tháng', 'Tạo checklist kiểm thử UX',
      'Sắp xếp ghi chú phỏng vấn', 'Viết kịch bản usability test', 'Kiểm tra dữ liệu biểu đồ',
      'Tóm tắt kết quả thử nghiệm', 'Chuẩn bị tài liệu bàn giao', 'Lên kế hoạch nghiên cứu tiếp theo',
    ],
  },
]

const completedOffsets = [-40, -35, -30, -25, -20, -15, -10, -5]
const completedStartOffsets = [-44, -40, -36, -31, -26, -21, -16, -11]
const inProgressStartOffsets = [-8, -6, -4, -3, -2, -1]
const inProgressDueOffsets = [1, 3, 5, 7, 9, 12]
const todoStartOffsets = [-12, -8, -2, 0, 2, 4, 6, 8, 11, 14]
const todoDueOffsets = [-4, -1, 2, 5, 8, 11, 14, 17, 21, 25]
const priorities = ['High', 'Medium', 'Low']

function dateAtOffset(days) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function buildSample(user, index) {
  let status
  let startOffset
  let dueOffset
  let completedOffset = null
  if (index < completedOffsets.length) {
    status = 'Done'
    startOffset = completedStartOffsets[index]
    completedOffset = completedOffsets[index]
    dueOffset = completedOffset + (index % 2 === 0 ? 2 : -2)
  } else if (index < 14) {
    const activeIndex = index - completedOffsets.length
    status = 'In Progress'
    startOffset = inProgressStartOffsets[activeIndex]
    dueOffset = inProgressDueOffsets[activeIndex]
  } else {
    const todoIndex = index - 14
    status = 'To do'
    startOffset = todoStartOffsets[todoIndex]
    dueOffset = todoDueOffsets[todoIndex]
  }

  return {
    key: `demo:${user.email.split('@')[0]}:task-${String(index + 1).padStart(2, '0')}`,
    title: user.tasks[index],
    description: `Đầu việc thuộc ${user.focus}; dữ liệu mẫu để kiểm tra lịch, bộ lọc và tiến độ.`,
    status,
    priority: priorities[(index + user.email.charCodeAt(4)) % priorities.length],
    start: startOffset,
    due: dueOffset,
    completed: completedOffset,
  }
}

function requireDemoConfiguration() {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Set NODE_ENV=development (or test) before seeding; production seeding is disabled.')
  }
  if (process.env.DEMO_SEED_ENABLED !== 'true') {
    throw new Error('Set DEMO_SEED_ENABLED=true to explicitly enable demo seeding.')
  }
  if (!password || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set DEMO_USER_PASSWORD to a unique password of 10-72 bytes.')
  }
}

async function seedDemo() {
  requireDemoConfiguration()
  const totals = { accountsCreated: 0, accountsExisting: 0, tasksCreated: 0, tasksExisting: 0 }

  await withTransaction(async (connection) => {
    let passwordHash
    for (const user of demoUsers) {
      const [existing] = await connection.query(
        'SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
        [user.email],
      )
      let userId
      if (existing) {
        if (existing.role !== 'user' || !existing.is_active) {
          throw new Error(`The configured demo account ${user.email} is inactive or is not a user account.`)
        }
        userId = existing.id
        totals.accountsExisting += 1
      } else {
        passwordHash ||= await bcrypt.hash(password, 12)
        const [createdUser] = await connection.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id',
          [user.name, user.email, passwordHash, 'user'],
        )
        userId = createdUser.id
        totals.accountsCreated += 1
      }
      user.id = userId

      for (let index = 0; index < user.tasks.length; index += 1) {
        const sample = buildSample(user, index)
        const [existingTask] = await connection.query(
          'SELECT id, owner_id FROM tasks WHERE seed_key = ? LIMIT 1',
          [sample.key],
        )
        if (existingTask) {
          if (Number(existingTask.owner_id) !== Number(userId)) {
            throw new Error(`Demo task key ${sample.key} is already owned by a different account.`)
          }
          totals.tasksExisting += 1
          continue
        }

        const createdOffset = Math.min(sample.start - 1, 0)
        const createdAt = createdOffset === 0 ? new Date() : dateAtOffset(createdOffset)
        const completedAt = sample.completed === null ? null : dateAtOffset(sample.completed)
        const updatedAt = completedAt || createdAt
        const [createdTask] = await connection.query(
          `INSERT INTO tasks
             (title, description, start_date, due_date, status, priority, owner_id, created_at, updated_at, completed_at, seed_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            sample.title,
            sample.description,
            dateAtOffset(sample.start).toISOString().slice(0, 10),
            dateAtOffset(sample.due).toISOString().slice(0, 10),
            sample.status,
            sample.priority,
            userId,
            createdAt,
            updatedAt,
            completedAt,
            sample.key,
          ],
        )
        if (!createdTask) throw new Error(`Could not create demo task ${sample.key}.`)
        totals.tasksCreated += 1
      }
    }
    const [admin] = await connection.query(
      "SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1 FOR UPDATE",
    )
    if (!admin) {
      throw new Error('Create or activate an Admin account before seeding the sample activity log.')
    }
    const sampleActivities = [
      { key: 'member-review', offset: -30, target: 0, description: 'Mẫu minh họa: rà soát tài khoản thành viên' },
      { key: 'account-enabled', offset: -26, target: 1, description: 'Mẫu minh họa: kích hoạt tài khoản thành viên' },
      { key: 'role-review', offset: -22, target: 2, description: 'Mẫu minh họa: rà soát quyền truy cập' },
      { key: 'member-support', offset: -18, target: 0, description: 'Mẫu minh họa: xem thông tin thành viên' },
      { key: 'account-review', offset: -14, target: 1, description: 'Mẫu minh họa: kiểm tra trạng thái tài khoản' },
      { key: 'access-audit', offset: -10, target: 2, description: 'Mẫu minh họa: rà soát vai trò người dùng' },
      { key: 'member-follow-up', offset: -5, target: 0, description: 'Mẫu minh họa: theo dõi tài khoản thành viên' },
      { key: 'system-check', offset: -1, target: 1, description: 'Mẫu minh họa: kiểm tra hoạt động quản trị' },
    ]
    for (const sample of sampleActivities) {
      const [existingActivity] = await connection.query(
        'SELECT id FROM admin_activity WHERE seed_key = ? LIMIT 1',
        [`demo:activity:${sample.key}`],
      )
      if (existingActivity) {
        totals.activitiesExisting = (totals.activitiesExisting || 0) + 1
        continue
      }
      const targetUserId = demoUsers[sample.target].id
      await connection.query(
        `INSERT INTO admin_activity
           (actor_id, target_user_id, target_type, target_id, action, description, details, seed_key, created_at)
         VALUES (?, ?, 'user', ?, 'demo.seed', ?, ?, ?, ?)`,
        [
          admin.id,
          targetUserId,
          targetUserId,
          sample.description,
          JSON.stringify({ seeded: true }),
          `demo:activity:${sample.key}`,
          dateAtOffset(sample.offset),
        ],
      )
      totals.activitiesCreated = (totals.activitiesCreated || 0) + 1
    }
  })

  console.info(
    `Demo seed complete: ${totals.accountsCreated} accounts created, ${totals.accountsExisting} existing; ` +
    `${totals.tasksCreated} tasks created, ${totals.tasksExisting} existing; ` +
    `${totals.activitiesCreated || 0} activity samples created, ${totals.activitiesExisting || 0} existing.`,
  )
}

try {
  await seedDemo()
} catch (error) {
  console.error('Demo seeding failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
