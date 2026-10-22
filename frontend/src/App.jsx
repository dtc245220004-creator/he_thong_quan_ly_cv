import { useCallback, useEffect, useState, useTransition } from 'react'
import { apiBaseUrl, requestApi } from './api.js'
import './App.css'

const statuses = ['To do', 'In Progress', 'Done']
const priorities = ['Low', 'Medium', 'High']
const statusLabels = { 'To do': 'Cần làm', 'In Progress': 'Đang thực hiện', Done: 'Hoàn thành' }
const priorityLabels = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao' }
const blankTask = {
  title: '',
  description: '',
  start_date: '',
  due_date: '',
  status: 'To do',
  priority: 'Medium',
  assignee: '',
}

function PublicPhoto({ className, alt }) {
  const [failed, setFailed] = useState(false)
  return (
    <img
      className={className}
      src={failed ? '/images/task-illustration.svg' : '/images/task-workspace.jpg'}
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}

function UserAvatar({ user, className = 'user-avatar' }) {
  const [failed, setFailed] = useState(false)
  return user.avatarVersion && !failed
    ? <img className={className} src={`${apiBaseUrl}/profile/avatar?v=${user.avatarVersion}`} alt="" onError={() => setFailed(true)} />
    : <span className={className} aria-hidden="true">{user.name.slice(0, 1).toLocaleUpperCase('vi')}</span>
}

function formatDate(value) {
  if (!value) return 'Chưa đặt'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })
    .format(new Date(value))
}

function activityLabel(action) {
  return ({
    'user.status': 'Thay đổi trạng thái tài khoản',
    'user.role': 'Thay đổi vai trò thành viên',
    'user.profile': 'Cập nhật hồ sơ thành viên',
    'auth.login': 'Đăng nhập quản trị',
    'auth.logout': 'Đăng xuất quản trị',
    'demo.seed': 'Sự kiện mẫu',
  })[action] || 'Hoạt động quản trị'
}

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [user, setUser] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [stats, setStats] = useState(null)
  const [taskPage, setTaskPage] = useState({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', due: '', sort: 'created', order: 'desc' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formTask, setFormTask] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formValues, setFormValues] = useState(blankTask)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const navigate = useCallback((destination) => {
    window.history.pushState({}, '', destination)
    setPath(destination)
    setAuthError('')
    setAuthNotice('')
  }, [])

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let active = true
    requestApi('/auth/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser)
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError.status !== 401) setSessionError(requestError.message)
        setUser(null)
      })
      .finally(() => {
        if (active) setSessionLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active && user && ['/', '/login', '/register', '/forgot-password', '/reset-password'].includes(path)) navigate('/dashboard')
    })
    return () => { active = false }
  }, [navigate, path, user])

  const loadDashboard = useCallback(async () => {
    if (!user) return
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '10',
      sort: filters.sort,
      order: filters.order,
    })
    for (const key of ['search', 'status', 'priority', 'due']) {
      if (filters[key]) params.set(key, filters[key])
    }
    try {
      const [nextStats, nextTasks] = await Promise.all([
        requestApi('/dashboard/stats'),
        requestApi(`/tasks?${params.toString()}`),
      ])
      setError('')
      setStats(nextStats)
      setTaskPage(nextTasks)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [filters, page, user])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) return loadDashboard()
      return undefined
    })
    return () => { active = false }
  }, [loadDashboard])

  async function submitAuth(event, type) {
    event.preventDefault()
    if (authBusy) return
    setAuthBusy(true)
    setAuthError('')
    setAuthNotice('')
    const fields = new FormData(event.currentTarget)
    const payload = Object.fromEntries(fields.entries())
    try {
      const result = await requestApi(`/auth/${type}`, { method: 'POST', body: payload })
      if (type === 'register') {
        navigate('/login')
        setAuthNotice(result.message)
      } else {
        setUser(result.user)
        setSessionError('')
        navigate('/dashboard')
      }
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthBusy(false)
    }
  }

  async function logout() {
    if (authBusy) return
    setAuthBusy(true)
    try {
      await requestApi('/auth/logout', { method: 'POST' })
      setUser(null)
      setStats(null)
      setTaskPage({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 })
      navigate('/')
    } catch (requestError) {
      setSessionError(requestError.message)
    } finally {
      setAuthBusy(false)
    }
  }

  function openCreate(initialDate = '') {
    setFormTask(null)
    setFormOpen(true)
    setFormValues({ ...blankTask, start_date: initialDate })
    setFormError('')
  }

  function openEdit(task) {
    setSelectedTask(null)
    setFormTask(task)
    setFormOpen(true)
    setFormValues({
      title: task.title,
      description: task.description || '',
      start_date: task.start_date || '',
      due_date: task.due_date || '',
      status: task.status,
      priority: task.priority,
      assignee: task.assignee || '',
    })
    setFormError('')
  }

  async function saveTask(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFormError('')
    const payload = {
      ...formValues,
      title: formValues.title.trim(),
      description: formValues.description.trim() || null,
      start_date: formValues.start_date || null,
      due_date: formValues.due_date || null,
      assignee: formValues.assignee.trim() || null,
    }
    try {
      await requestApi(formTask ? `/tasks/${formTask.id}` : '/tasks', {
        method: formTask ? 'PUT' : 'POST',
        body: payload,
      })
      setFormOpen(false)
      await loadDashboard()
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(task, status) {
    try {
      await requestApi(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status } })
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function showTask(id) {
    setSelectedTask(null)
    setDetailLoading(true)
    try {
      setSelectedTask(await requestApi(`/tasks/${id}`))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDetailLoading(false)
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Bạn có chắc muốn xóa công việc “${task.title}” không?`)) return
    try {
      await requestApi(`/tasks/${task.id}`, { method: 'DELETE' })
      setSelectedTask(null)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (sessionLoading || (user && ['/', '/login', '/register', '/forgot-password', '/reset-password'].includes(path))) {
    return <main className="loading-page" role="status">Đang kiểm tra phiên đăng nhập...</main>
  }

  const privateRoute = ['/dashboard', '/tasks', '/calendar', '/progress', '/profile'].includes(path) || path.startsWith('/admin')
  if (privateRoute && !user) {
    return (
      <div className="public-shell">
        <PublicHeader user={null} navigate={navigate} />
        <main className="auth-stage">
          <section className="auth-aside">
            <span className="auth-aside-mark" aria-hidden="true">✓</span>
            <p className="eyebrow">KHÔNG GIAN CỦA RIÊNG BẠN</p>
            <h2>{sessionError ? 'Phiên làm việc cần được xác minh.' : 'Công việc của bạn luôn ở đúng nơi.'}</h2>
            <p>{sessionError || 'Đăng nhập để tiếp tục từ nơi bạn đã dừng lại, với dữ liệu được lưu an toàn trong tài khoản.'}</p>
            <PublicPhoto className="auth-illustration auth-photo" alt="Đồng nghiệp cùng làm việc và trao đổi kế hoạch bên laptop" />
          </section>
          <section className="auth-card">
            <p className="eyebrow">TASK TRACKER</p>
            <h1>{sessionError ? 'Không thể kiểm tra phiên' : 'Vui lòng đăng nhập'}</h1>
            <p className="auth-description">{sessionError || 'Đăng nhập để xem và quản lý công việc của bạn.'}</p>
            {sessionError && <button className="button secondary" onClick={() => window.location.reload()}>Thử lại</button>}
            <a className="button primary full-width" href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>Đăng nhập</a>
          </section>
        </main>
      </div>
    )
  }
  if (path.startsWith('/admin') && user?.role !== 'admin') {
    return (
      <div className="public-shell">
        <PublicHeader user={user} navigate={navigate} />
        <main className="auth-stage access-denied">
          <section className="auth-card">
            <p className="eyebrow">KHU VỰC QUẢN TRỊ</p>
            <h1>Bạn không có quyền truy cập</h1>
            <p className="auth-description">Chỉ tài khoản quản trị viên mới có thể mở khu vực này.</p>
            <a className="button primary full-width" href="/dashboard" onClick={(event) => { event.preventDefault(); navigate('/dashboard') }}>Về tổng quan</a>
          </section>
        </main>
      </div>
    )
  }

  if (!user && (path === '/login' || path === '/register')) {
    const registering = path === '/register'
    return (
      <div className="public-shell">
        <PublicHeader user={null} navigate={navigate} />
        <main className={`auth-stage ${registering ? 'register-stage' : 'login-stage'}`}>
          <section className="auth-aside">
            <span className="auth-aside-mark" aria-hidden="true">✓</span>
            <p className="eyebrow">{registering ? 'BẮT ĐẦU TỪ ĐÂY' : 'CHÀO MỪNG TRỞ LẠI'}</p>
            <h2>{registering ? 'Tạo nhịp làm việc phù hợp với bạn.' : 'Tiếp tục hoàn thành điều quan trọng.'}</h2>
            <p>{registering ? 'Một tài khoản riêng tư, một danh sách bắt đầu theo cách của bạn.' : 'Đăng nhập để xem lại tiến độ và tiếp tục từ công việc gần nhất.'}</p>
            <PublicPhoto className="auth-illustration auth-photo" alt="Góc làm việc sáng với sổ kế hoạch, laptop và cây xanh" />
            <div className="auth-aside-note"><span aria-hidden="true">01</span><span>Dữ liệu cá nhân được lưu và chỉ hiển thị trong tài khoản của bạn.</span></div>
          </section>
          <section className="auth-card">
            <p className="eyebrow">TASK TRACKER</p>
            <h1>{registering ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
            <p className="auth-description">
              {registering ? 'Đăng ký để bắt đầu sắp xếp và theo dõi công việc.' : 'Đăng nhập để tiếp tục quản lý công việc của bạn.'}
            </p>
            {authNotice && <p className="notice" role="status">{authNotice}</p>}
            {authError && <p className="error-message" role="alert">{authError}</p>}
            <form className="auth-form" onSubmit={(event) => submitAuth(event, registering ? 'register' : 'login')}>
              {registering && <label>Họ và tên<input name="name" autoComplete="name" minLength="2" maxLength="120" required /></label>}
              <label>Email<input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
              <label>Mật khẩu<PasswordInput name="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 10 : undefined} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} /></label>
              {registering && <label>Xác nhận mật khẩu<PasswordInput name="passwordConfirmation" autoComplete="new-password" visible={showPassword} onToggle={() => setShowPassword((value) => !value)} /></label>}
              {registering && <p className="field-hint">Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.</p>}
              {!registering && <a className="forgot-password-link" href="/forgot-password" onClick={(event) => { event.preventDefault(); navigate('/forgot-password') }}>Quên mật khẩu?</a>}
              <button className="button primary full-width" disabled={authBusy}>{authBusy ? 'Đang xử lý...' : registering ? 'Đăng ký' : 'Đăng nhập'}</button>
            </form>
            <p className="auth-switch">
              {registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
              <a href={registering ? '/login' : '/register'} onClick={(event) => { event.preventDefault(); navigate(registering ? '/login' : '/register') }}>
                {registering ? 'Đăng nhập' : 'Đăng ký'}
              </a>
            </p>
          </section>
        </main>
        <PublicFooter />
      </div>
    )
  }

  if (!user && ['/forgot-password', '/reset-password'].includes(path)) {
    return <div className="public-shell"><PublicHeader user={null} navigate={navigate} /><main className="auth-stage reset-stage">
      <section className="auth-card">
        <p className="eyebrow">BẢO MẬT TÀI KHOẢN</p>
        <h1>{path === '/forgot-password' ? 'Quên mật khẩu?' : 'Đặt mật khẩu mới'}</h1>
        <p className="auth-description">{path === '/forgot-password' ? 'Nhập email để nhận hướng dẫn nếu tài khoản còn hoạt động.' : 'Chọn mật khẩu mới cho tài khoản của bạn.'}</p>
        <PasswordResetForm reset={path === '/reset-password'} navigate={navigate} />
        <p className="auth-switch"><a href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>Quay lại đăng nhập</a></p>
      </section>
    </main><PublicFooter /></div>
  }

  if (!user) {
    return (
      <div className="public-shell">
        <PublicHeader user={null} navigate={navigate} />
        <main className="landing">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">LÀM CHỦ THỜI GIAN CỦA BẠN</p>
              <h1>Biến công việc thành <span>những thành tựu.</span></h1>
              <p>Tập trung vào điều quan trọng với một không gian đơn giản để lên kế hoạch, theo dõi tiến độ và hoàn thành công việc đúng hạn.</p>
              <div className="hero-actions">
                <a className="button primary" href="/register" onClick={(event) => { event.preventDefault(); navigate('/register') }}>Bắt đầu ngay <span aria-hidden="true">→</span></a>
                <a className="button secondary" href="#features">Tìm hiểu thêm</a>
              </div>
              <div className="hero-note"><span aria-hidden="true">✓</span> Dữ liệu riêng tư, được lưu an toàn trong tài khoản của bạn</div>
            </div>
            <PublicPhoto className="hero-illustration" alt="Góc làm việc tối giản với laptop, sổ kế hoạch và cây xanh" />
          </section>
          <section className="intro-section" id="about">
            <p className="eyebrow">ÍT RỐI HƠN, NHIỀU TIẾN ĐỘ HƠN</p>
            <h2>Biến danh sách việc cần làm thành kế hoạch có thể thực hiện</h2>
            <p>Khi đầu việc nằm rải rác, thật khó để biết nên bắt đầu từ đâu. Task Tracker giúp bạn gom công việc vào một nơi, xác định ưu tiên và nhìn thấy bước tiếp theo.</p>
          </section>
          <section className="feature-grid" id="features">
            <article><span className="feature-icon" aria-hidden="true">01</span><h3>Một nơi để theo dõi</h3><p>Tạo công việc, ghi chú mô tả, đặt hạn hoàn thành và cập nhật tiến độ trong cùng một danh sách.</p></article>
            <article><span className="feature-icon" aria-hidden="true">02</span><h3>Ưu tiên rõ ràng</h3><p>Phân loại mức độ ưu tiên, tìm kiếm và lọc để nhanh chóng tập trung vào việc cần làm trước.</p></article>
            <article><span className="feature-icon" aria-hidden="true">03</span><h3>Tiến độ luôn được lưu</h3><p>Tài khoản và công việc được lưu an toàn, sẵn sàng khi bạn quay lại đăng nhập.</p></article>
            <article><span className="feature-icon" aria-hidden="true">04</span><h3>Không quên thời hạn</h3><p>Đặt hạn hoàn thành và xem nhanh những công việc sắp đến hạn.</p></article>
          </section>
          <section className="steps-section" id="how-it-works">
            <p className="eyebrow">BẮT ĐẦU TRONG VÀI BƯỚC</p><h2>Cách sử dụng</h2>
            <ol><li><strong>Tạo tài khoản</strong><span>Đăng ký bằng họ tên, email và mật khẩu của bạn.</span></li>
              <li><strong>Thêm công việc</strong><span>Ghi tiêu đề, mô tả, mức ưu tiên và hạn hoàn thành.</span></li>
              <li><strong>Theo dõi tiến độ</strong><span>Cập nhật trạng thái và xem những việc sắp đến hạn.</span></li></ol>
          </section>
          <section className="cta-section"><img src="/images/checklist-empty.svg" alt="" /><div><h2>Sẵn sàng sắp xếp công việc?</h2><p>Tạo tài khoản của bạn và bắt đầu với danh sách trống, theo cách bạn muốn.</p>
            <a className="button primary" href="/register" onClick={(event) => { event.preventDefault(); navigate('/register') }}>Đăng ký ngay</a></div></section>
        </main>
        <PublicFooter />
      </div>
    )
  }

  if (path.startsWith('/admin')) {
    return <AdminWorkspace path={path} navigate={navigate} user={user} setUser={setUser} logout={logout} authBusy={authBusy} />
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/dashboard" onClick={(event) => { event.preventDefault(); navigate('/dashboard') }}><span className="brand-mark" aria-hidden="true">✓</span>Task Tracker</a>
        <p className="nav-caption">KHÔNG GIAN CÁ NHÂN</p>
        <a className={`side-link ${path === '/dashboard' ? 'active' : ''}`} href="/dashboard" onClick={(event) => { event.preventDefault(); navigate('/dashboard') }}><NavIcon name="overview" /><span>Tổng quan</span></a>
        <a className={`side-link ${path === '/tasks' ? 'active' : ''}`} href="/tasks" onClick={(event) => { event.preventDefault(); navigate('/tasks') }}><NavIcon name="tasks" /><span>Công việc</span><span className="side-count">{stats?.counts.total || 0}</span></a>
        <a className={`side-link ${path === '/calendar' ? 'active' : ''}`} href="/calendar" onClick={(event) => { event.preventDefault(); navigate('/calendar') }}><NavIcon name="calendar" /><span>Lịch công việc</span></a>
        <a className={`side-link ${path === '/progress' ? 'active' : ''}`} href="/progress" onClick={(event) => { event.preventDefault(); navigate('/progress') }}><NavIcon name="progress" /><span>Tiến độ</span></a>
        <a className={`side-link ${path === '/profile' ? 'active' : ''}`} href="/profile" onClick={(event) => { event.preventDefault(); navigate('/profile') }}><NavIcon name="profile" /><span>Hồ sơ</span></a>
        {user.role === 'admin' && <a className={`side-link ${path.startsWith('/admin') ? 'active' : ''}`} href="/admin" onClick={(event) => { event.preventDefault(); navigate('/admin') }}><NavIcon name="admin" /><span>Quản trị</span></a>}
        <div className="sidebar-account">
          <a className="sidebar-account-link" href="/profile" onClick={(event) => { event.preventDefault(); navigate('/profile') }} aria-label="Mở hồ sơ cá nhân"><UserAvatar user={user} /><span className="user-label"><strong>{user.name}</strong><span>{user.email}</span></span></a>
        </div>
        <button className="side-logout" onClick={logout} disabled={authBusy}><span aria-hidden="true">↪</span>{authBusy ? 'Đang đăng xuất...' : 'Đăng xuất'}</button>
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <span>{{ '/dashboard': 'Tổng quan', '/tasks': 'Quản lý công việc', '/calendar': 'Lịch công việc', '/progress': 'Tiến độ', '/profile': 'Hồ sơ cá nhân' }[path] || 'Task Tracker'}</span>
          <a className="workspace-account-link" href="/profile" onClick={(event) => { event.preventDefault(); navigate('/profile') }} aria-label="Mở hồ sơ cá nhân"><UserAvatar user={user} /><span className="user-email">{user.name}</span></a>
        </header>
        <div className="workspace-content">
          {error && <div className="error-message workspace-error" role="alert"><span>{error}</span><button className="button small secondary" onClick={loadDashboard}>Thử lại</button></div>}
          {path === '/dashboard' && <>
            <section className="workspace-title"><div><p className="eyebrow">TASK TRACKER · KHÔNG GIAN CÁ NHÂN</p><h1>Xin chào, {user.name.split(' ')[0]}</h1><p>Theo dõi tiến độ và sắp xếp công việc của bạn.</p></div><button className="button primary" onClick={openCreate}>＋ Tạo công việc</button></section>
            <section className="stats-grid" aria-label="Thống kê công việc">
              <Stat label="Tổng công việc" value={stats?.counts.total} icon="total" />
              <Stat label="Cần làm" value={stats?.counts.todo} icon="todo" />
              <Stat label="Đang thực hiện" value={stats?.counts.inProgress} icon="progress" />
              <Stat label="Hoàn thành" value={stats?.counts.completed} icon="done" />
              <Stat label="Quá hạn" value={stats?.counts.overdue} icon="overdue" />
            </section>
            <section className="dashboard-progress content-card" aria-label="Tiến độ hoàn thành">
              <div><span className="section-kicker">TIẾN ĐỘ</span><h2>Tổng quan hoàn thành</h2><p>Tỷ lệ công việc đã hoàn thành trong không gian của bạn.</p></div>
              <div className="progress-track" role="progressbar" aria-label="Tỷ lệ hoàn thành" aria-valuemin="0" aria-valuemax="100" aria-valuenow={stats?.counts.total ? Math.round(stats.counts.completed / stats.counts.total * 100) : 0}>
                <span style={{ width: `${stats?.counts.total ? Math.round(stats.counts.completed / stats.counts.total * 100) : 0}%` }} />
              </div>
              <strong>{stats?.counts.total ? Math.round(stats.counts.completed / stats.counts.total * 100) : 0}%</strong>
              <span className="progress-caption">{stats?.counts.completed ?? '—'} / {stats?.counts.total ?? '—'} công việc hoàn thành</span>
            </section>
            <section className="dashboard-lists">
              <article className="content-card"><div className="section-heading"><div><span className="section-kicker">LỊCH TRÌNH</span><h2>Sắp đến hạn</h2></div><a href="/tasks" onClick={(event) => { event.preventDefault(); navigate('/tasks') }}>Xem tất cả</a></div>
                {stats?.upcoming?.length ? <ul className="compact-list">{stats.upcoming.map((task) => <li key={task.id}><button onClick={() => showTask(task.id)}>{task.title}</button><span>{formatDate(task.due_date)}</span></li>)}</ul> : <p className="muted">Chưa có công việc sắp đến hạn.</p>}
              </article>
              <article className="content-card"><div className="section-heading"><div><span className="section-kicker">CẬP NHẬT</span><h2>Công việc gần đây</h2></div><a href="/tasks" onClick={(event) => { event.preventDefault(); navigate('/tasks') }}>Xem tất cả</a></div>
                {stats?.recent?.length ? <ul className="compact-list">{stats.recent.map((task) => <li key={task.id}><button onClick={() => showTask(task.id)}>{task.title}</button><span>{statusLabels[task.status]}</span></li>)}</ul> : <div className="dashboard-empty"><img src="/images/checklist-empty.svg" alt="" /><p>Danh sách đang chờ việc đầu tiên của bạn.</p><button className="text-action" onClick={openCreate}>＋ Tạo công việc</button></div>}
              </article>
            </section>
            <section className="dashboard-priority content-card">
              <div><span className="section-kicker">PHÂN BỐ CÔNG VIỆC</span><h2>Theo mức độ ưu tiên</h2></div>
              <span className="priority-count high-priority">Cao <b>{stats?.counts.highPriority ?? '—'}</b></span>
              <span className="priority-count medium-priority">Trung bình <b>{stats?.counts.mediumPriority ?? '—'}</b></span>
              <span className="priority-count low-priority">Thấp <b>{stats?.counts.lowPriority ?? '—'}</b></span>
            </section>
          </>}
          {path === '/dashboard' && <section className="dashboard-quick-action"><div><span className="section-kicker">BẮT ĐẦU NGAY</span><h2>Một bước nhỏ, tiến độ rõ ràng.</h2><p>Tạo công việc mới hoặc mở danh sách để sắp xếp kế hoạch.</p></div><div><button className="button primary" onClick={openCreate}>＋ Tạo công việc</button><button className="button secondary" onClick={() => navigate('/tasks')}>Xem tất cả công việc</button></div><img src="/images/checklist-empty.svg" alt="" /></section>}
          {path === '/tasks' && <section className="tasks-page-heading"><div><span className="section-kicker">KHÔNG GIAN CÁ NHÂN</span><h1>Quản lý công việc</h1><p>Tìm, sắp xếp và cập nhật từng đầu việc trong kế hoạch của bạn.</p></div><button className="button primary" onClick={openCreate}>＋ Tạo công việc</button></section>}
          {path === '/tasks' && <section className="content-card task-card" id="tasks">
            <div className="card-heading"><div><span className="section-kicker">DANH SÁCH CỦA BẠN</span><h2>Công việc</h2><p>{taskPage.total} công việc trong danh sách</p></div></div>
            <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...filters, search: searchInput.trim() }) }}>
              <label className="search-field"><span aria-hidden="true">⌕</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tiêu đề hoặc mô tả" aria-label="Tìm công việc" /></label>
              <select aria-label="Lọc trạng thái" value={filters.status} onChange={(event) => { setPage(1); setFilters({ ...filters, status: event.target.value }) }}><option value="">Mọi trạng thái</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
              <select aria-label="Lọc ưu tiên" value={filters.priority} onChange={(event) => { setPage(1); setFilters({ ...filters, priority: event.target.value }) }}><option value="">Mọi ưu tiên</option>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select>
              <select aria-label="Lọc hạn hoàn thành" value={filters.due} onChange={(event) => { setPage(1); setFilters({ ...filters, due: event.target.value }) }}><option value="">Mọi hạn</option><option value="overdue">Quá hạn</option><option value="upcoming">Sắp đến hạn</option><option value="none">Chưa đặt hạn</option></select>
              <select aria-label="Sắp xếp" value={`${filters.sort}:${filters.order}`} onChange={(event) => { const [sort, order] = event.target.value.split(':'); setFilters({ ...filters, sort, order }) }}><option value="created:desc">Mới cập nhật</option><option value="created:asc">Cũ nhất</option><option value="due:asc">Hạn gần nhất</option><option value="due:desc">Hạn xa nhất</option><option value="status:asc">Trạng thái</option><option value="priority:desc">Mức ưu tiên</option></select>
              <button className="button secondary" type="submit">Tìm</button>
            </form>
            {loading ? <p className="empty-message" role="status">Đang tải dữ liệu...</p> : taskPage.items.length === 0 ? <div className={`empty-message ${taskPage.total === 0 && !filters.search && !filters.status && !filters.priority && !filters.due ? 'empty-first-task' : ''}`}>{taskPage.total === 0 && !filters.search && !filters.status && !filters.priority && !filters.due && <img src="/images/checklist-empty.svg" alt="" />}<strong>{filters.search || filters.status || filters.priority || filters.due ? 'Không tìm thấy công việc phù hợp' : 'Bạn chưa có công việc nào'}</strong><span>{filters.search || filters.status || filters.priority || filters.due ? 'Thử điều chỉnh từ khóa hoặc bộ lọc để xem thêm.' : 'Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ.'}</span><button className="button primary" onClick={openCreate}>{taskPage.total === 0 ? '＋ Tạo công việc đầu tiên' : '＋ Tạo công việc'}</button></div> : (
              <div className="table-scroll"><table className="task-table"><thead><tr><th>CÔNG VIỆC</th><th>TRẠNG THÁI</th><th>ƯU TIÊN</th><th>HẠN</th><th>NGƯỜI PHỤ TRÁCH</th><th></th></tr></thead><tbody>
                {taskPage.items.map((task) => <tr key={task.id}><td data-label="Công việc"><button className="task-title" onClick={() => showTask(task.id)}>{task.title}</button><span className="task-description">{task.description || 'Không có mô tả'}</span></td>
                  <td data-label="Trạng thái"><label className={`status-badge ${task.status === 'Done' ? 'status-done' : task.status === 'In Progress' ? 'status-progress' : 'status-todo'}`}><select aria-label={`Trạng thái: ${task.title}`} value={task.status} onChange={(event) => changeStatus(task, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label></td>
                  <td data-label="Ưu tiên"><span className={`priority-badge priority-${task.priority.toLowerCase()}`}>{priorityLabels[task.priority]}</span></td><td data-label="Hạn">{formatDate(task.due_date)}</td><td data-label="Người phụ trách">{task.assignee || 'Chưa giao'}</td><td data-label="Thao tác"><button className="text-action" onClick={() => openEdit(task)}>Sửa</button><button className="text-action danger-action" onClick={() => deleteTask(task)}>Xóa</button></td></tr>)}
              </tbody></table></div>
            )}
            <div className="pagination"><span>{taskPage.total} công việc · Trang {taskPage.page} / {Math.max(taskPage.totalPages, 1)}</span><div><button className="button small secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Trước</button><button className="button small secondary" disabled={page >= taskPage.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Tiếp</button></div></div>
          </section>}
          {path === '/calendar' && <CalendarPage showTask={showTask} openCreate={openCreate} />}
          {path === '/progress' && <ProgressPage />}
          {path === '/profile' && <ProfilePage user={user} setUser={setUser} logout={logout} authBusy={authBusy} />}
          <footer className="workspace-footer">Task Tracker · Dữ liệu được lưu trong MySQL và chỉ hiển thị trong tài khoản của bạn.</footer>
        </div>
      </main>

      {formOpen && <TaskDialog task={formTask} values={formValues} setValues={setFormValues} saving={saving} error={formError} onSubmit={saveTask} onClose={() => !saving && setFormOpen(false)} />}
      {selectedTask && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTask(null) }}><section className="dialog" role="dialog" aria-modal="true"><div className="dialog-heading"><div><p className="eyebrow">CHI TIẾT CÔNG VIỆC</p><h2>{selectedTask.title}</h2></div><button className="close-button" onClick={() => setSelectedTask(null)} aria-label="Đóng">×</button></div><p>{selectedTask.description || 'Chưa có mô tả.'}</p><dl className="detail-list"><div><dt>Trạng thái</dt><dd>{statusLabels[selectedTask.status]}</dd></div><div><dt>Ưu tiên</dt><dd>{priorityLabels[selectedTask.priority]}</dd></div><div><dt>Ngày bắt đầu</dt><dd>{formatDate(selectedTask.start_date)}</dd></div><div><dt>Hạn hoàn thành</dt><dd>{formatDate(selectedTask.due_date)}</dd></div><div><dt>Người phụ trách</dt><dd>{selectedTask.assignee || 'Chưa giao'}</dd></div></dl><div className="dialog-actions"><button className="button danger" onClick={() => deleteTask(selectedTask)}>Xóa</button><button className="button secondary" onClick={() => setSelectedTask(null)}>Đóng</button><button className="button primary" onClick={() => openEdit(selectedTask)}>Sửa</button></div></section></div>}
      {detailLoading && <div className="overlay"><div className="dialog" role="status">Đang tải công việc...</div></div>}
    </div>
  )
}

function localDateString(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromString(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateRangeFor(view, anchor, selectedDate) {
  if (view === 'day') return { from: selectedDate, to: selectedDate }
  if (view === 'week') {
    const start = dateFromString(selectedDate)
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    return { from: localDateString(start), to: localDateString(end) }
  }
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7))
  const end = new Date(first)
  end.setUTCDate(end.getUTCDate() + 41)
  return { from: localDateString(first), to: localDateString(end) }
}

function CalendarPage({ showTask, openCreate }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [anchor, setAnchor] = useState(() => dateFromString(new Date().toISOString().slice(0, 10)))
  const [selectedDate, setSelectedDate] = useState(today)
  const [view, setView] = useState('month')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()
  const range = dateRangeFor(view, anchor, selectedDate)
  const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(anchor)
  const weekDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
  const cells = []
  if (view === 'month') {
    const start = dateFromString(range.from)
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      cells.push(localDateString(date))
    }
  } else if (view === 'week') {
    const start = dateFromString(range.from)
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      cells.push(localDateString(date))
    }
  } else cells.push(selectedDate)

  useEffect(() => {
    const params = new URLSearchParams({ startDate: range.from, endDate: range.to })
    if (status) params.set('status', status)
    if (priority) params.set('priority', priority)
    let active = true
    startTransition(() => setLoading(true))
    requestApi(`/calendar?${params}`)
      .then((result) => { if (active) { setItems(result.items); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range.from, range.to, status, priority, reload])

  function shiftPeriod(amount) {
    if (view === 'day' || view === 'week') {
      const next = dateFromString(selectedDate)
      next.setUTCDate(next.getUTCDate() + amount * (view === 'week' ? 7 : 1))
      const date = localDateString(next)
      setSelectedDate(date)
      setAnchor(next)
      return
    }
    const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + amount, 1))
    setAnchor(next)
    setSelectedDate(localDateString(next))
  }

  const dayTasks = items.filter((task) => taskOccursOnDate(task, selectedDate))
  const dateLabel = (date) => new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dateFromString(date))

  return (
    <section className="calendar-page">
      <div className="page-heading"><div><span className="section-kicker">KẾ HOẠCH CỦA BẠN</span><h1>Lịch công việc</h1><p>Xem ngày bắt đầu và hạn hoàn thành của từng công việc.</p></div><button className="button primary" onClick={() => openCreate(selectedDate)}>＋ Tạo công việc</button></div>
      <section className="content-card calendar-card">
        <div className="calendar-toolbar">
          <div className="calendar-month-controls"><button className="button secondary small" aria-label="Khoảng thời gian trước" onClick={() => shiftPeriod(-1)}>‹</button><h2>{view === 'day' ? dateLabel(selectedDate) : monthName}</h2><button className="button secondary small" aria-label="Khoảng thời gian sau" onClick={() => shiftPeriod(1)}>›</button><button className="button secondary small" onClick={() => { const now = dateFromString(new Date().toISOString().slice(0, 10)); setAnchor(now); setSelectedDate(localDateString(now)) }}>Hôm nay</button></div>
          <div className="calendar-options"><select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Mọi trạng thái</option>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select><select aria-label="Lọc ưu tiên" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Mọi ưu tiên</option>{priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select><label className="calendar-selected-date">Ngày<input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) { setSelectedDate(event.target.value); setAnchor(dateFromString(event.target.value)) } }} /></label><div className="segmented-control" aria-label="Chế độ lịch">{[['month', 'Tháng'], ['week', 'Tuần'], ['day', 'Ngày']].map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}</div></div>
        </div>
        <div className="calendar-legend"><span><i className="status-todo" />Cần làm</span><span><i className="status-progress" />Đang thực hiện</span><span><i className="status-done" />Hoàn thành</span><span className="calendar-priority-note">Ưu tiên cao có dấu chấm đỏ</span></div>
        {error && <div className="error-message workspace-error" role="alert"><span>{error}</span><button className="button secondary small" onClick={() => setReload((value) => value + 1)}>Thử lại</button></div>}
        {loading ? <p className="empty-message" role="status">Đang tải lịch công việc...</p> : (
          <div className={`calendar-grid calendar-${view}`}>
            {view !== 'day' && (view === 'month' ? weekDays : weekDays.map((day) => day)).map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
            {cells.map((date) => {
              const dayTasksForCell = items.filter((task) => taskOccursOnDate(task, date))
              return <div key={date} className={`calendar-day ${date.slice(0, 7) !== localDateString(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))).slice(0, 7) && view === 'month' ? 'outside-month' : ''} ${date === today ? 'is-today' : ''} ${date === selectedDate ? 'is-selected' : ''}`} role="button" tabIndex="0" onClick={() => setSelectedDate(date)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDate(date) } }}>
                <span className="calendar-day-number">{Number(date.slice(8, 10))}{date === today && <i>Hôm nay</i>}</span>
                <span className="calendar-events">{dayTasksForCell.slice(0, view === 'month' ? 2 : 10).map((task) => <button type="button" key={task.id} className={`calendar-event status-${task.status === 'Done' ? 'done' : task.status === 'In Progress' ? 'progress' : 'todo'} ${task.priority === 'High' ? 'high' : ''}`} title={`${task.title} · ${statusLabels[task.status]} · ${priorityLabels[task.priority]}`} onClick={(event) => { event.stopPropagation(); showTask(task.id) }}>{task.title}</button>)}{dayTasksForCell.length > 2 && view === 'month' && <span className="calendar-more">+{dayTasksForCell.length - 2} việc</span>}</span>
              </div>
            })}
          </div>
        )}
      </section>
      <section className="content-card calendar-day-list"><div className="section-heading"><div><span className="section-kicker">NGÀY ĐÃ CHỌN</span><h2>{dateLabel(selectedDate)}</h2></div><button className="button primary small" onClick={() => openCreate(selectedDate)}>＋ Thêm việc ngày này</button></div>
        {loading ? <p className="muted">Đang tải danh sách...</p> : dayTasks.length ? <ul className="calendar-task-list">{dayTasks.map((task) => <li key={task.id}><button className="calendar-task-title" onClick={() => showTask(task.id)}>{task.title}</button><span className={`status-badge status-${task.status === 'Done' ? 'done' : task.status === 'In Progress' ? 'progress' : 'todo'}`}>{statusLabels[task.status]}</span><span className={`priority-badge priority-${task.priority.toLowerCase()}`}>{priorityLabels[task.priority]}</span><span>{task.due_date ? `Hạn ${formatDate(task.due_date)}` : `Bắt đầu ${formatDate(task.start_date)}`}</span></li>)}</ul> : <p className="muted">Ngày này chưa có công việc nào trong bộ lọc hiện tại.</p>}
      </section>
    </section>
  )
}

function taskOccursOnDate(task, date) {
  const start = task.start_date || task.due_date
  const end = task.due_date || task.start_date
  return Boolean(start && end && start <= date && date <= end)
}

function progressDefaultRange(mode, now = new Date()) {
  if (mode === 'month') return { from: localDateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: localDateString(now) }
  if (mode === 'year') return { from: `${now.getUTCFullYear()}-01-01`, to: localDateString(now) }
  const from = new Date(now)
  from.setUTCDate(from.getUTCDate() - 13)
  return { from: localDateString(from), to: localDateString(now) }
}

function chartPeriods(from, to, groupBy) {
  const result = []
  if (groupBy === 'day') {
    const date = dateFromString(from)
    const end = dateFromString(to)
    for (; date <= end; date.setUTCDate(date.getUTCDate() + 1)) result.push(localDateString(date))
  } else if (groupBy === 'month') {
    const date = dateFromString(`${from.slice(0, 7)}-01`)
    const end = dateFromString(`${to.slice(0, 7)}-01`)
    for (; date <= end; date.setUTCMonth(date.getUTCMonth() + 1)) result.push(localDateString(date).slice(0, 7))
  } else {
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) result.push(String(year))
  }
  return result
}

function ProgressPage() {
  const currentMode = 'day'
  const [groupBy, setGroupBy] = useState(currentMode)
  const [range, setRange] = useState(() => progressDefaultRange(currentMode))
  const [priority, setPriority] = useState('')
  const [chartType, setChartType] = useState('bar')
  const [summary, setSummary] = useState(null)
  const [completionItems, setCompletionItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return
    const params = new URLSearchParams({ from: range.from, to: range.to, groupBy })
    if (priority) params.set('priority', priority)
    let active = true
    startTransition(() => setLoading(true))
    Promise.all([requestApi(`/progress/summary?${params}`), requestApi(`/progress/completions?${params}`)])
      .then(([nextSummary, nextCompletions]) => {
        if (!active) return
        setSummary(nextSummary)
        setCompletionItems(nextCompletions.items)
        setError('')
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range.from, range.to, groupBy, priority, reload])

  const periods = range.from && range.to && range.from <= range.to ? chartPeriods(range.from, range.to, groupBy) : []
  const countByPeriod = new Map(completionItems.map((item) => [String(item.period), item.completed]))
  const values = periods.map((period) => ({ period, count: countByPeriod.get(period) || 0 }))
  const max = Math.max(1, ...values.map((item) => item.count))
  const chartWidth = Math.max(700, values.length * 36)
  const chartHeight = 230
  const pointX = (index) => 38 + (values.length <= 1 ? 0 : (index * (chartWidth - 65)) / (values.length - 1))
  const pointY = (value) => 184 - (value / max) * 148

  return (
    <section className="progress-page">
      <div className="page-heading"><div><span className="section-kicker">NHÌN LẠI TIẾN ĐỘ</span><h1>Tiến độ hoàn thành</h1><p>Theo dõi công việc đã hoàn thành theo ngày, tháng và năm.</p></div></div>
      <section className="content-card progress-controls">
        <div className="segmented-control" aria-label="Nhóm theo thời gian">{[['day', 'Ngày'], ['month', 'Tháng'], ['year', 'Năm']].map(([key, label]) => <button key={key} className={groupBy === key ? 'active' : ''} onClick={() => { setGroupBy(key); setRange(progressDefaultRange(key)) }}>{label}</button>)}</div>
        <label>Từ ngày<input type="date" value={range.from} max={range.to} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label>
        <label>Đến ngày<input type="date" value={range.to} min={range.from} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label>
        <label>Ưu tiên<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Mọi mức</option>{priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select></label>
        <button className="button secondary" onClick={() => setRange(progressDefaultRange(groupBy))}>Khoảng hiện tại</button>
      </section>
      {range.from > range.to && <p className="error-message" role="alert">Ngày bắt đầu không thể sau ngày kết thúc.</p>}
      {error && <div className="error-message workspace-error" role="alert"><span>{error}</span><button className="button secondary small" onClick={() => setReload((value) => value + 1)}>Thử lại</button></div>}
      {loading ? <section className="content-card empty-message" role="status">Đang tải dữ liệu tiến độ...</section> : <>
        <section className="progress-stats" aria-label="Chỉ số hoàn thành">
          <ProgressStat label="Hoàn thành trong khoảng" value={summary?.completedInRange ?? 0} detail={summary?.completionChangePercent === null ? 'Chưa có dữ liệu ở kỳ liền trước để so sánh.' : `${summary?.completionChangePercent >= 0 ? '+' : ''}${summary?.completionChangePercent}% so với kỳ liền trước (${summary?.previousPeriodCompleted} việc)`} />
          <ProgressStat label="Hoàn thành hôm nay" value={summary?.completedToday ?? 0} />
          <ProgressStat label="Hoàn thành tháng này" value={summary?.completedThisMonth ?? 0} />
          <ProgressStat label="Tỷ lệ hoàn thành nhóm việc mới" value={`${summary?.completionRate ?? 0}%`} detail={`${summary?.completedFromCreated ?? 0} / ${summary?.totalCreated ?? 0} công việc tạo trong kỳ`} />
        </section>
        <section className="content-card progress-chart-card">
          <div className="section-heading"><div><span className="section-kicker">LỊCH SỬ HOÀN THÀNH</span><h2>Công việc theo {groupBy === 'day' ? 'ngày' : groupBy === 'month' ? 'tháng' : 'năm'}</h2><p>{formatDate(range.from)} — {formatDate(range.to)}</p></div><div className="segmented-control" aria-label="Kiểu biểu đồ"><button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>Cột</button><button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Đường</button></div></div>
          {values.length === 0 ? <p className="error-message" role="alert">Chọn khoảng ngày hợp lệ để xem biểu đồ.</p> : <div className="chart-scroll"><svg className="progress-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Biểu đồ ${chartType === 'bar' ? 'cột' : 'đường'} công việc hoàn thành`}>
            {[0, 1, 2, 3].map((step) => { const y = 184 - step * 48; return <g key={step}><line x1="36" y1={y} x2={chartWidth - 12} y2={y} className="chart-gridline" /><text x="26" y={y + 4} textAnchor="end" className="chart-axis-label">{Math.round(max * step / 3)}</text></g>})}
            {chartType === 'bar' ? values.map((item, index) => { const width = Math.max(5, Math.min(22, (chartWidth - 80) / values.length * .58)); const x = pointX(index) - width / 2; const y = pointY(item.count); return <g key={item.period}><rect x={x} y={y} width={width} height={184 - y} rx="4" className="chart-bar"><title>{item.period}: {item.count} công việc hoàn thành</title></rect>{(index % Math.max(1, Math.ceil(values.length / 12)) === 0 || index === values.length - 1) && <text x={pointX(index)} y="211" textAnchor="middle" className="chart-axis-label">{item.period.slice(groupBy === 'day' ? 5 : 0)}</text>}</g>}) : <><polyline points={values.map((item, index) => `${pointX(index)},${pointY(item.count)}`).join(' ')} className="chart-line" />{values.map((item, index) => <g key={item.period}><circle cx={pointX(index)} cy={pointY(item.count)} r="4" className="chart-point"><title>{item.period}: {item.count} công việc hoàn thành</title></circle>{(index % Math.max(1, Math.ceil(values.length / 12)) === 0 || index === values.length - 1) && <text x={pointX(index)} y="211" textAnchor="middle" className="chart-axis-label">{item.period.slice(groupBy === 'day' ? 5 : 0)}</text>}</g>)}</>}
          </svg></div>}
          {summary?.completedInRange === 0 && <p className="chart-empty">Chưa có công việc hoàn thành trong khoảng thời gian này. Khi bạn hoàn thành công việc, dữ liệu sẽ xuất hiện tại đây.</p>}
        </section>
      </>}
    </section>
  )
}

function ProgressStat({ label, value, detail }) {
  return <article className="content-card progress-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>
}

function PasswordResetForm({ reset, navigate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  useEffect(() => {
    if (reset && token) window.history.replaceState({}, '', window.location.pathname)
  }, [reset, token])
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const result = await requestApi(reset ? '/auth/reset-password' : '/auth/forgot-password', {
        method: 'POST',
        body: reset ? { ...fields, token } : fields,
      })
      if (reset) {
        navigate('/login')
        return
      }
      setNotice(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }
  return <form className="auth-form" onSubmit={submit}>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!reset ? <label>Email<input name="email" type="email" autoComplete="email" maxLength="254" required /></label> : <>
      <label>Mật khẩu mới<PasswordInput name="newPassword" autoComplete="new-password" minLength={10} visible={false} onToggle={() => {}} /></label>
      <label>Xác nhận mật khẩu mới<PasswordInput name="passwordConfirmation" autoComplete="new-password" visible={false} onToggle={() => {}} /></label>
      <p className="field-hint">Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.</p>
    </>}
    <button className="button primary full-width" disabled={busy}>{busy ? 'Đang xử lý...' : reset ? 'Đặt lại mật khẩu' : 'Gửi hướng dẫn'}</button>
  </form>
}

function ProfilePage({ user, setUser, logout, authBusy }) {
  const [profile, setProfile] = useState(null)
  const [name, setName] = useState(user.name)
  const [editing, setEditing] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', passwordConfirmation: '' })
  useEffect(() => {
    let active = true
    requestApi('/profile')
      .then((result) => {
        if (active) {
          setProfile(result)
          setName(result.name)
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])
  function chooseAvatar(event) {
    const file = event.target.files?.[0]
    setError('')
    setNotice('')
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Chỉ chấp nhận ảnh PNG hoặc JPEG, tối đa 2 MB.')
      event.target.value = ''
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }
  const save = async (event) => {
    event.preventDefault()
    if (passwords.newPassword && passwords.passwordConfirmation !== passwords.newPassword) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    if (passwords.newPassword && !passwords.currentPassword) {
      setError('Nhập mật khẩu hiện tại để đổi mật khẩu.')
      return
    }
    setBusy(true)
    setNotice('')
    setError('')
    try {
      let updated = await requestApi('/profile', { method: 'PATCH', body: { name } })
      if (avatarFile) {
        const avatar = await requestApi('/profile/avatar', {
          method: 'PUT',
          body: avatarFile,
          headers: { 'Content-Type': avatarFile.type },
        })
        updated = { ...updated, ...avatar }
      }
      if (passwords.newPassword) {
        const result = await requestApi('/profile/password', { method: 'PATCH', body: passwords })
        setNotice(result.message)
      } else {
        setNotice('Hồ sơ đã được cập nhật.')
      }
      setUser((current) => ({ ...current, ...updated }))
      setProfile((current) => ({ ...current, ...updated }))
      setName(updated.name)
      setAvatarFile(null)
      setAvatarPreview('')
      setPasswords({ currentPassword: '', newPassword: '', passwordConfirmation: '' })
      setEditing(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }
  const stats = profile?.stats || { total: 0, completed: 0, inProgress: 0, completionRate: 0 }
  return (
    <section className="profile-page">
      <div className="page-heading"><div><span className="section-kicker">TÀI KHOẢN</span><h1>Hồ sơ cá nhân</h1><p>Thông tin cá nhân và tiến độ công việc.</p></div></div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <ErrorNotice message={error} retry={() => { setLoading(true); setError(''); requestApi('/profile').then((result) => { setProfile(result); setName(result.name) }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false)) }} />}
      {loading ? <section className="content-card empty-message" role="status">Đang tải hồ sơ...</section> : profile && <>
        <section className="content-card profile-identity">
          <div className="profile-identity-main">
            <UserAvatar user={profile} className="profile-avatar" />
            <div><span className="section-kicker">THÔNG TIN CÁ NHÂN</span><h2>{profile.name}</h2><p>{profile.email}</p></div>
          </div>
          <div className="profile-identity-meta"><span>{profile.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}</span><span>Tham gia {formatDate(String(profile.created_at).slice(0, 10))}</span></div>
          <button className="button secondary" onClick={() => { setEditing((value) => !value); setError('') }}>{editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa hồ sơ'}</button>
        </section>
        {editing && <form className="content-card profile-form" onSubmit={save}>
          <h2>Chỉnh sửa hồ sơ</h2>
          <div className="profile-avatar-editor"><div className="avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Xem trước ảnh đại diện" /> : <UserAvatar user={profile} className="profile-avatar" />}</div>
            <label className="button secondary avatar-file-button">Đổi ảnh đại diện<input type="file" accept="image/png,image/jpeg" onChange={chooseAvatar} /></label>
            <span className="field-hint">PNG hoặc JPEG, tối đa 2 MB.</span>
          </div>
          <label>Họ và tên<input value={name} minLength="2" maxLength="120" required onChange={(event) => setName(event.target.value)} /></label>
          <label>Email<input value={profile.email} readOnly /></label>
          <div className="profile-password-fields"><h3>Đổi mật khẩu (không bắt buộc)</h3>
            <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords((value) => ({ ...value, currentPassword: event.target.value }))} /></label>
            <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength="10" value={passwords.newPassword} onChange={(event) => setPasswords((value) => ({ ...value, newPassword: event.target.value }))} /></label>
            <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" value={passwords.passwordConfirmation} onChange={(event) => setPasswords((value) => ({ ...value, passwordConfirmation: event.target.value }))} /></label>
            <p className="field-hint">Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số. Các phiên khác sẽ bị thu hồi.</p>
          </div>
          <p className="profile-readonly-note">Email và vai trò hiện chỉ được quản lý theo chính sách tài khoản hiện tại.</p>
          <div className="profile-form-actions"><button className="button secondary" type="button" onClick={() => { setEditing(false); setAvatarFile(null); setAvatarPreview(''); setPasswords({ currentPassword: '', newPassword: '', passwordConfirmation: '' }) }}>Hủy</button><button className="button primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
        </form>}
        <section className="profile-overview">
          <div className="section-heading"><div><span className="section-kicker">TỔNG QUAN CÔNG VIỆC</span><h2>Tiến độ của bạn</h2></div></div>
          <div className="profile-stats">
            <article className="content-card"><span>Tổng công việc</span><strong>{stats.total}</strong></article>
            <article className="content-card"><span>Đã hoàn thành</span><strong>{stats.completed}</strong></article>
            <article className="content-card"><span>Đang thực hiện</span><strong>{stats.inProgress}</strong></article>
            <article className="content-card"><span>Tỷ lệ hoàn thành</span><strong>{stats.completionRate}%</strong></article>
          </div>
        </section>
        <section className="content-card profile-settings">
          <div><span className="section-kicker">CÀI ĐẶT TÀI KHOẢN</span><h2>Thông tin đăng nhập</h2><p>Mật khẩu được cập nhật trong phần chỉnh sửa hồ sơ.</p></div>
          <div className="profile-logout"><span>Rời khỏi tài khoản trên thiết bị này.</span><button className="button danger" onClick={logout} disabled={authBusy}>{authBusy ? 'Đang đăng xuất...' : 'Đăng xuất'}</button></div>
        </section>
      </>}
    </section>
  )
}

function AdminWorkspace({ path, navigate, user, setUser, logout, authBusy }) {
  const links = [['/admin', 'Tổng quan quản trị', 'admin'], ['/admin/users', 'Thành viên', 'profile'], ['/admin/tasks', 'Công việc hệ thống', 'tasks'], ['/admin/activity', 'Nhật ký hoạt động', 'progress']]
  const title = links.find(([href]) => href === path)?.[1] || 'Quản trị'
  return <div className="workspace admin-workspace"><aside className="sidebar"><a className="brand" href="/admin" onClick={(event) => { event.preventDefault(); navigate('/admin') }}><span className="brand-mark" aria-hidden="true">✓</span>Task Tracker</a><p className="nav-caption">QUẢN TRỊ HỆ THỐNG</p>{links.map(([href, label, icon]) => <a key={href} className={`side-link ${path === href ? 'active' : ''}`} href={href} onClick={(event) => { event.preventDefault(); navigate(href) }}><NavIcon name={icon} /><span>{label}</span></a>)}<a className={`side-link ${path === '/admin/profile' ? 'active' : ''}`} href="/admin/profile" onClick={(event) => { event.preventDefault(); navigate('/admin/profile') }}><NavIcon name="profile" /><span>Hồ sơ Admin</span></a><div className="sidebar-account"><a className="sidebar-account-link" href="/admin/profile" onClick={(event) => { event.preventDefault(); navigate('/admin/profile') }}><UserAvatar user={user} /><span className="user-label"><strong>{user.name}</strong><span>Quản trị viên</span></span></a></div><button className="side-logout" onClick={logout} disabled={authBusy}>↪ Đăng xuất</button></aside><main className="workspace-main"><header className="workspace-header"><span>{path === '/admin/profile' ? 'Hồ sơ Admin' : title}</span><a className="workspace-account-link" href="/admin/profile" onClick={(event) => { event.preventDefault(); navigate('/admin/profile') }} aria-label="Mở hồ sơ Admin"><UserAvatar user={user} /><span className="user-email">{user.name}</span></a></header><div className="workspace-content"><AdminPage path={path} navigate={navigate} user={user} setUser={setUser} logout={logout} authBusy={authBusy} /><footer className="workspace-footer">Khu vực quản trị · Mọi thay đổi quyền hạn đều được ghi nhật ký.</footer></div></main></div>
}

function AdminPage({ path, navigate, user, setUser, logout, authBusy }) {
  if (path === '/admin/profile') return <ProfilePage user={user} setUser={setUser} logout={logout} authBusy={authBusy} />
  if (path === '/admin/users') return <AdminUsersPage />
  if (path === '/admin/tasks') return <AdminTasksPage />
  if (path === '/admin/activity') return <AdminActivityPage />
  return <AdminOverview navigate={navigate} />
}

function AdminOverview({ navigate }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()
  const load = () => setReload((value) => value + 1)
  useEffect(() => {
    let active = true
    startTransition(() => setLoading(true))
    requestApi('/admin/stats').then((result) => { if (active) { setStats(result); setError('') } }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])
  return <section className="admin-page"><div className="page-heading"><div><span className="section-kicker">QUẢN TRỊ HỆ THỐNG</span><h1>Tổng quan quản trị</h1><p>Tình trạng tài khoản, công việc và hoạt động mới nhất.</p></div></div>{error && <ErrorNotice message={error} retry={load} />}{loading ? <p className="empty-message" role="status">Đang tải thống kê...</p> : stats && <><h2 className="admin-section-title">Thành viên</h2><div className="admin-stat-grid"><ProgressStat label="Tổng thành viên" value={stats.users.totalUsers} /><ProgressStat label="Đang hoạt động" value={stats.users.activeUsers} /><ProgressStat label="Đã vô hiệu hóa" value={stats.users.inactiveUsers} /></div><h2 className="admin-section-title">Công việc toàn hệ thống</h2><div className="admin-stat-grid"><ProgressStat label="Tổng công việc" value={stats.tasks.totalTasks} /><ProgressStat label="Hoàn thành" value={stats.tasks.completed} /><ProgressStat label="Đang thực hiện" value={stats.tasks.inProgress} /><ProgressStat label="Cần làm" value={stats.tasks.todo} /></div><section className="content-card admin-recent"><div className="section-heading"><h2>Thành viên mới</h2><button className="text-action" onClick={() => navigate('/admin/users')}>Quản lý thành viên →</button></div><AdminUserTable users={stats.recentUsers} onOpen={() => navigate('/admin/users')} /></section><section className="content-card admin-recent"><div className="section-heading"><h2>Hoạt động gần đây</h2><button className="text-action" onClick={() => navigate('/admin/activity')}>Mở nhật ký →</button></div><div className="admin-recent-activity">{stats.recentActivity?.length ? stats.recentActivity.map((item) => <article key={item.id}><strong>{item.description || activityLabel(item.action)}</strong><span>{item.actorName} · {formatDateTime(item.created_at)}</span></article>) : <p className="empty-message">Chưa có hoạt động quản trị.</p>}</div></section><div className="admin-shortcuts"><button className="button primary" onClick={() => navigate('/admin/users')}>Quản lý thành viên</button><button className="button secondary" onClick={() => navigate('/admin/tasks')}>Xem công việc hệ thống</button></div></>}</section>
}

function AdminUsersPage() {
  const [filters, setFilters] = useState({ search: '', role: '', status: '', sort: 'created', order: 'desc' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0, page: 1 })
  const [selected, setSelected] = useState(null)
  const [selectedName, setSelectedName] = useState('')
  const [detailTasks, setDetailTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20', ...filters })
    let active = true
    startTransition(() => setLoading(true))
    requestApi(`/admin/users?${params}`).then((data) => { if (active) { setResult(data); setError('') } }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, reload])
  async function openDetail(id) {
    try {
      const [detail, tasks] = await Promise.all([requestApi(`/admin/users/${id}`), requestApi(`/admin/users/${id}/tasks?limit=5`)])
      setSelected(detail)
      setSelectedName(detail.name)
      setDetailTasks(tasks.items)
    } catch (requestError) { setError(requestError.message) }
  }
  async function updateUser(user, field, value) {
    if (!window.confirm(field === 'isActive' ? `${value ? 'Kích hoạt' : 'Vô hiệu hóa'} tài khoản ${user.email}?` : `Đổi vai trò tài khoản ${user.email} thành ${value}?`)) return
    try {
      await requestApi(`/admin/users/${user.id}/${field === 'isActive' ? 'status' : 'role'}`, { method: 'PATCH', body: field === 'isActive' ? { isActive: value } : { role: value } })
      setReload((count) => count + 1)
      if (selected?.id === user.id) await openDetail(user.id)
    } catch (requestError) { setError(requestError.message) }
  }
  async function saveMemberProfile(event) {
    event.preventDefault()
    try {
      const updated = await requestApi(`/admin/users/${selected.id}`, {
        method: 'PATCH',
        body: { name: selectedName },
      })
      setSelected((current) => ({ ...current, ...updated }))
      setReload((count) => count + 1)
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  return <section className="admin-page"><div className="page-heading"><div><span className="section-kicker">QUẢN TRỊ HỆ THỐNG</span><h1>Quản lý thành viên</h1><p>{result.total} tài khoản · thông tin xác thực được bảo vệ.</p></div></div><form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters((current) => ({ ...current, search: searchInput.trim() })) }}><input className="admin-search" aria-label="Tìm thành viên" placeholder="Tìm theo tên hoặc email" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><select aria-label="Lọc vai trò" value={filters.role} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, role: event.target.value })) }}><option value="">Mọi vai trò</option><option value="user">Người dùng</option><option value="admin">Admin</option></select><select aria-label="Lọc trạng thái tài khoản" value={filters.status} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, status: event.target.value })) }}><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã khóa</option></select><select aria-label="Sắp xếp thành viên" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="created">Ngày tham gia</option><option value="name">Tên</option><option value="email">Email</option></select><button className="button secondary">Tìm kiếm</button></form>{error && <ErrorNotice message={error} retry={() => setReload((count) => count + 1)} />}{loading ? <p className="empty-message" role="status">Đang tải thành viên...</p> : result.items.length ? <><div className="admin-table-wrap"><AdminUserTable users={result.items} onOpen={(id) => openDetail(id)} actions={(user) => <div className="admin-row-actions"><button className="text-action" onClick={() => updateUser(user, 'isActive', !user.is_active)}>{user.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}</button><select aria-label={`Vai trò ${user.email}`} value={user.role} onChange={(event) => updateUser(user, 'role', event.target.value)}><option value="user">Người dùng</option><option value="admin">Admin</option></select></div>} /> </div><Pagination page={page} totalPages={result.totalPages} loading={loading} onChange={setPage} /></> : <p className="empty-message">Không tìm thấy thành viên phù hợp.</p>}{selected && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="dialog admin-user-dialog" role="dialog" aria-modal="true"><div className="dialog-heading"><div><p className="eyebrow">CHI TIẾT THÀNH VIÊN</p><h2>{selected.name}</h2></div><button className="close-button" onClick={() => setSelected(null)} aria-label="Đóng">×</button></div><dl className="detail-list"><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Vai trò</dt><dd>{selected.role}</dd></div><div><dt>Trạng thái</dt><dd>{selected.is_active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</dd></div><div><dt>Ngày đăng ký</dt><dd>{formatDate(String(selected.created_at).slice(0, 10))}</dd></div><div><dt>Tổng công việc</dt><dd>{selected.taskCount}</dd></div><div><dt>Đã hoàn thành</dt><dd>{selected.completedTaskCount}</dd></div></dl><form className="admin-member-edit" onSubmit={saveMemberProfile}><label>Tên hiển thị<input value={selectedName} minLength="2" maxLength="120" required onChange={(event) => setSelectedName(event.target.value)} /></label><button className="button secondary small">Lưu tên</button></form><h3>Công việc gần đây</h3>{detailTasks.map((task) => <p className="admin-detail-task" key={task.id}>{task.title} · {statusLabels[task.status]}</p>)}<div className="dialog-actions"><button className="button secondary" onClick={() => setSelected(null)}>Đóng</button><button className="button primary" onClick={() => updateUser(selected, 'isActive', !selected.is_active)}>{selected.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}</button></div></section></div>}</section>
}

function AdminUserTable({ users, onOpen, actions }) {
  return <table className="admin-table"><thead><tr><th>ID</th><th>Thành viên</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày đăng ký</th><th>Công việc</th>{actions && <th>Thao tác</th>}</tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.id}</td><td><button className="admin-user-link" onClick={() => onOpen(user.id)}>{user.name}</button><small>{user.email}</small></td><td>{user.role === 'admin' ? 'Admin' : 'Người dùng'}</td><td><span className={`status-badge ${user.is_active ? 'status-done' : 'status-todo'}`}>{user.is_active ? 'Hoạt động' : 'Đã khóa'}</span></td><td>{formatDate(String(user.created_at).slice(0, 10))}</td><td>{user.taskCount ?? '—'}</td>{actions && <td>{actions(user)}</td>}</tr>)}</tbody></table>
}

function AdminTasksPage() {
  const [filters, setFilters] = useState({ search: '', ownerId: '', status: '', priority: '', overdue: '' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], owners: [], total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20', ...filters })
    let active = true
    startTransition(() => setLoading(true))
    requestApi(`/admin/tasks?${params}`).then((data) => { if (active) { setResult(data); setError('') } }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, reload])
  return <section className="admin-page"><div className="page-heading"><div><span className="section-kicker">QUẢN TRỊ HỆ THỐNG</span><h1>Công việc toàn hệ thống</h1><p>{result.total} công việc thuộc các tài khoản người dùng.</p></div></div><form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters((current) => ({ ...current, search: searchInput.trim() })) }}><input className="admin-search" aria-label="Tìm công việc hệ thống" placeholder="Tìm tiêu đề hoặc email chủ sở hữu" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><select aria-label="Lọc thành viên" value={filters.ownerId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, ownerId: event.target.value })) }}><option value="">Mọi thành viên</option>{result.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>)}</select><select aria-label="Lọc trạng thái" value={filters.status} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, status: event.target.value })) }}><option value="">Mọi trạng thái</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><select aria-label="Lọc ưu tiên" value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}><option value="">Mọi ưu tiên</option>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select><select aria-label="Lọc quá hạn" value={filters.overdue} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, overdue: event.target.value })) }}><option value="">Mọi hạn công việc</option><option value="true">Quá hạn</option></select><button className="button secondary">Tìm kiếm</button></form>{error && <ErrorNotice message={error} retry={() => setReload((count) => count + 1)} />}{loading ? <p className="empty-message" role="status">Đang tải công việc...</p> : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Công việc</th><th>Chủ sở hữu</th><th>Trạng thái</th><th>Ưu tiên</th><th>Ngày tạo</th><th>Hạn</th></tr></thead><tbody>{result.items.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.ownerName}<small>{task.ownerEmail}</small></td><td>{statusLabels[task.status]}</td><td>{priorityLabels[task.priority]}</td><td>{formatDate(String(task.created_at).slice(0, 10))}</td><td>{formatDate(task.due_date)}</td></tr>)}</tbody></table>{!result.items.length && <p className="empty-message">Chưa có công việc phù hợp.</p>}</div><Pagination page={page} totalPages={result.totalPages} loading={loading} onChange={setPage} /></>}</section>
}

function AdminActivityPage() {
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({ search: '', action: '', adminId: '', from: '', to: '' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    startTransition(() => setLoading(true))
    requestApi(`/admin/activity?${params}`).then((data) => { if (active) { setResult(data); setError('') } }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, reload])
  const applyFilters = (event) => {
    event.preventDefault()
    setPage(1)
    setFilters((current) => ({ ...current, search: searchInput.trim() }))
  }
  return <section className="admin-page"><div className="page-heading"><div><span className="section-kicker">NHẬT KÝ QUẢN TRỊ</span><h1>Nhật ký hoạt động</h1><p>{result.total} sự kiện · dữ liệu ghi nhận từ backend.</p></div></div>
    <form className="admin-filters activity-filters" onSubmit={applyFilters}>
      <input className="admin-search" aria-label="Tìm nhật ký" placeholder="Tìm quản trị viên, thành viên hoặc mô tả" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
      <select aria-label="Lọc hành động" value={filters.action} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, action: event.target.value })) }}><option value="">Mọi hành động</option><option value="user.status">Trạng thái tài khoản</option><option value="user.role">Vai trò thành viên</option><option value="user.profile">Cập nhật hồ sơ thành viên</option><option value="auth.login">Đăng nhập quản trị</option><option value="auth.logout">Đăng xuất quản trị</option><option value="demo.seed">Sự kiện mẫu</option></select>
      <select aria-label="Lọc quản trị viên" value={filters.adminId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, adminId: event.target.value })) }}><option value="">Mọi quản trị viên</option>{(result.admins || []).map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}</select>
      <label>Từ ngày<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, from: event.target.value })) }} /></label>
      <label>Đến ngày<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, to: event.target.value })) }} /></label>
      <button className="button secondary">Tìm kiếm</button>
    </form>
    {error && <ErrorNotice message={error} retry={() => setReload((value) => value + 1)} />}
    {loading ? <p className="empty-message" role="status">Đang tải nhật ký...</p> : result.items.length ? <><div className="admin-table-wrap activity-table-wrap"><table className="admin-table"><thead><tr><th>Thời điểm</th><th>Quản trị viên</th><th>Hành động</th><th>Đối tượng</th><th>Mô tả</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.actorName}<small>{item.actorEmail}</small></td><td><span className={`activity-badge ${item.seedKey ? 'sample' : ''}`}>{activityLabel(item.action)}{item.seedKey ? ' · Mẫu' : ''}</span></td><td>{item.targetName || item.targetEmail || `${item.targetType === 'user' ? 'Thành viên' : item.targetType} #${item.targetId || item.targetUserId || ''}`}</td><td>{item.description}</td></tr>)}</tbody></table></div><Pagination page={page} totalPages={result.totalPages} loading={loading} onChange={setPage} /></> : <p className="empty-message">{filters.search || filters.action || filters.from || filters.to || filters.adminId ? 'Không tìm thấy sự kiện phù hợp.' : 'Chưa có hoạt động quản trị nào.'}</p>}
  </section>
}

function Pagination({ page, totalPages, loading, onChange }) {
  return <div className="pagination"><span>Trang {page} / {Math.max(totalPages, 1)}</span><div><button className="button small secondary" disabled={page <= 1 || loading} onClick={() => onChange((current) => current - 1)}>Trước</button><button className="button small secondary" disabled={page >= totalPages || loading} onClick={() => onChange((current) => current + 1)}>Tiếp</button></div></div>
}

function ErrorNotice({ message, retry }) {
  return <div className="error-message workspace-error" role="alert"><span>{message}</span><button className="button secondary small" onClick={retry}>Thử lại</button></div>
}

function Stat({ label, value, icon }) {
  const paths = {
    total: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
    todo: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    progress: <><path d="M4 17V7m5 10V4m5 13v-6m5 6V9" /></>,
    done: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    overdue: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5m0 3h.01" /></>,
  }
  return <article className={`stat-card stat-${icon}`}><span>{label}</span><i aria-hidden="true"><svg viewBox="0 0 24 24">{paths[icon]}</svg></i><strong>{value ?? '—'}</strong></article>
}

function PublicHeader({ user, navigate }) {
  return <header className="public-header"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}><span className="brand-mark" aria-hidden="true">✓</span>Task Tracker</a><nav aria-label="Điều hướng"><a href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>Trang chủ</a><a href="/#features">Tính năng</a><a href="/#how-it-works">Hướng dẫn</a></nav><div className="header-actions">{user ? <a className="button primary" href="/dashboard">Không gian của tôi</a> : <><a href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>Đăng nhập</a><a className="button primary" href="/register" onClick={(event) => { event.preventDefault(); navigate('/register') }}>Đăng ký</a></>}</div></header>
}

function NavIcon({ name }) {
  const paths = {
    overview: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    tasks: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="m8 9 1.5 1.5L12 8m1 2h3m-8 5 1.5 1.5L12 14m1 2h3" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4m9-4v4M4 10h16m-12 4h.01m4 0h.01m4 0h.01m-8 4h.01m4 0h.01" /></>,
    progress: <><path d="M4 19V5m0 14h17M8 15l4-4 3 2 5-6" /><path d="M16 7h4v4" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" /></>,
    admin: <><path d="M12 3 4.5 6v5c0 5 3.2 8.3 7.5 10 4.3-1.7 7.5-5 7.5-10V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function PublicFooter() {
  const [year] = useState(() => new Date().getFullYear())
  return <footer className="public-footer">
    <div className="public-footer-brand"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">✓</span>Task Tracker</a><p>Gom kế hoạch, ưu tiên điều quan trọng và theo dõi tiến độ mỗi ngày.</p></div>
    <nav aria-label="Liên kết trang"><a href="/">Trang chủ</a><a href="/#features">Tính năng</a><a href="/#how-it-works">Hướng dẫn</a></nav>
    <nav aria-label="Tài khoản"><a href="/login">Đăng nhập</a><a href="/register">Đăng ký</a></nav>
    <small>© {year} Task Tracker</small>
  </footer>
}

function PasswordInput({ name, autoComplete, minLength, visible, onToggle }) {
  return <span className="password-control"><input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} required /><button type="button" onClick={onToggle} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? 'Ẩn' : 'Hiện'}</button></span>
}

function TaskDialog({ task, values, setValues, saving, error, onSubmit, onClose }) {
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }))
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title"><div className="dialog-heading"><div><p className="eyebrow">{task ? 'CẬP NHẬT' : 'CÔNG VIỆC MỚI'}</p><h2 id="task-dialog-title">{task ? 'Sửa công việc' : 'Tạo công việc'}</h2></div><button className="close-button" onClick={onClose} aria-label="Đóng">×</button></div><form className="task-form" onSubmit={onSubmit}>
    <label className="span-two">Tiêu đề *<input autoFocus required maxLength="255" value={values.title} onChange={(event) => update('title', event.target.value)} /></label>
    <label className="span-two">Mô tả<textarea rows="4" maxLength="5000" value={values.description} onChange={(event) => update('description', event.target.value)} /></label>
    <label>Trạng thái<select value={values.status} onChange={(event) => update('status', event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
    <label>Mức ưu tiên<select value={values.priority} onChange={(event) => update('priority', event.target.value)}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
    <label>Ngày bắt đầu<input type="date" max={values.due_date || undefined} value={values.start_date} onChange={(event) => update('start_date', event.target.value)} /></label>
    <label>Hạn hoàn thành<input type="date" min={values.start_date || undefined} value={values.due_date} onChange={(event) => update('due_date', event.target.value)} /></label>
    <label className="span-two">Người phụ trách (tùy chọn)<input maxLength="120" value={values.assignee} onChange={(event) => update('assignee', event.target.value)} /></label>
    {error && <p className="error-message span-two" role="alert">{error}</p>}
    <div className="dialog-actions span-two"><button className="button secondary" type="button" disabled={saving} onClick={onClose}>Hủy</button><button className="button primary" disabled={saving}>{saving ? 'Đang lưu...' : task ? 'Lưu thay đổi' : 'Tạo công việc'}</button></div>
  </form></section></div>
}

export default App
