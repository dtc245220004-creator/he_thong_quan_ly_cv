export function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function parseDateRange(from, to, maximumDays = 366) {
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    throw requestError(400, 'Khoảng ngày phải hợp lệ và ngày bắt đầu không được sau ngày kết thúc.')
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1
  if (days > maximumDays) {
    throw requestError(400, `Khoảng ngày không được vượt quá ${maximumDays} ngày.`)
  }
  return { from, to, days }
}

export function parsePositiveId(value, label = 'ID') {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw requestError(400, `${label} không hợp lệ.`)
  return id
}

export function parsePage(value, fallback, maximum = 1000000) {
  if (value === undefined) return fallback
  const page = Number(value)
  if (!Number.isInteger(page) || page < 1) throw requestError(400, 'Tham số phân trang không hợp lệ.')
  return Math.min(page, maximum)
}
