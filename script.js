'use strict';

const STORAGE_KEY = 'passroom-passes-v1';
const WEEKLY_PASS_LIMIT = 5;
const DEFAULT_PASS_MINUTES = 5;
const MAX_PASS_MINUTES = 120;
const VALID_STATUSES = new Set(['pending', 'approved', 'denied', 'returned']);
const roleButtons = document.querySelectorAll('[data-role]');
const studentView = document.querySelector('#student-view');
const teacherView = document.querySelector('#teacher-view');
const studentForm = document.querySelector('#student-form');
const studentNameInput = document.querySelector('#student-name');
const passReasonInput = document.querySelector('#pass-reason');
const requestButton = document.querySelector('#request-button');
const studentStatus = document.querySelector('#student-status');
const requestList = document.querySelector('#request-list');
const activeList = document.querySelector('#active-list');
const historyList = document.querySelector('#history-list');
const pendingCount = document.querySelector('#pending-count');
const storageAlert = document.querySelector('#storage-alert');
const teacherNotice = document.querySelector('#teacher-notice');

function readPasses() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (saved === null) {
    return [];
  }

  let passes;
  try {
    passes = JSON.parse(saved);
  } catch {
    throw new Error('Saved pass data could not be read. Clear this site’s saved data to start again.');
  }

  if (!Array.isArray(passes) || passes.some((pass) => (
    !pass
    || typeof pass.id !== 'string'
    || typeof pass.student !== 'string'
    || (pass.reason !== undefined && typeof pass.reason !== 'string')
    || (pass.allowedMinutes !== undefined
      && (!Number.isInteger(pass.allowedMinutes)
        || pass.allowedMinutes < 1
        || pass.allowedMinutes > MAX_PASS_MINUTES))
    || !VALID_STATUSES.has(pass.status)
    || typeof pass.requestedAt !== 'number'
  ))) {
    throw new Error('Saved pass data is invalid. Clear this site’s saved data to start again.');
  }

  return passes;
}

function savePasses(passes) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
}

function showStorageError(error) {
  storageAlert.textContent = error.message || 'Pass data could not be saved in this browser.';
  storageAlert.hidden = false;
  requestButton.disabled = true;
}

function clearStorageError() {
  storageAlert.textContent = '';
  storageAlert.hidden = true;
  requestButton.disabled = false;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function startOfWeek(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date.getTime();
}

function weeklyPassCount(passes, studentName, now = Date.now()) {
  const normalizedName = studentName.trim().toLocaleLowerCase();
  const weekStart = startOfWeek(now);

  return passes.filter((pass) => {
    if (pass.student.trim().toLocaleLowerCase() !== normalizedName) {
      return false;
    }

    if (pass.status !== 'approved' && pass.status !== 'returned') {
      return false;
    }

    const approvedAt = pass.approvedAt || pass.requestedAt;
    return approvedAt >= weekStart && approvedAt <= now;
  }).length;
}

function weeklyUsageMessage(passes, studentName) {
  const used = weeklyPassCount(passes, studentName);
  return `Weekly passes: ${used} of ${WEEKLY_PASS_LIMIT} used.`;
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function getCheckInTiming(pass) {
  const approvedAt = pass.approvedAt || pass.requestedAt;
  const allowedMinutes = Number.isInteger(pass.allowedMinutes) && pass.allowedMinutes > 0
    ? pass.allowedMinutes
    : DEFAULT_PASS_MINUTES;
  const lateBy = Math.max(0, pass.returnedAt - approvedAt - allowedMinutes * 60_000);

  if (lateBy === 0) {
    return { className: 'badge-on-time', label: 'On time' };
  }

  const lateMinutes = Math.ceil(lateBy / 60_000);
  const severityClass = lateMinutes <= 5
    ? 'badge-late-warning'
    : lateMinutes <= 15
      ? 'badge-late-caution'
      : 'badge-late-severe';

  return {
    className: severityClass,
    label: `${formatDuration(lateBy)} late`,
  };
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function makeEmptyState(message) {
  return makeElement('p', 'empty-list', message);
}

function matchingStudentPass(passes, studentName) {
  const normalizedName = studentName.trim().toLocaleLowerCase();
  if (!normalizedName) {
    return null;
  }

  return passes
    .filter((pass) => pass.student.trim().toLocaleLowerCase() === normalizedName)
    .sort((first, second) => second.requestedAt - first.requestedAt)
    .find((pass) => pass.status === 'pending' || pass.status === 'approved' || pass.status === 'returned' || pass.status === 'denied');
}

function renderStudentStatus(passes) {
  studentStatus.replaceChildren();
  const pass = matchingStudentPass(passes, studentNameInput.value);

  if (!pass) {
    const studentName = studentNameInput.value.trim();
    const used = studentName ? weeklyPassCount(passes, studentName) : 0;
    studentStatus.append(
      makeElement('div', 'empty-symbol', '✓'),
      makeElement('h3', '', 'Ready when you are'),
      makeElement('p', '', used >= WEEKLY_PASS_LIMIT
        ? `You’ve used all ${WEEKLY_PASS_LIMIT} passes for this week.`
        : 'Submit a request and keep an eye out for your teacher’s approval.'),
      ...(studentName ? [makeElement('p', 'weekly-usage', weeklyUsageMessage(passes, studentName))] : [])
    );
    requestButton.disabled = Boolean(studentName && used >= WEEKLY_PASS_LIMIT);
    return;
  }

  if (pass.status === 'pending') {
    studentStatus.append(
      makeElement('span', 'badge badge-pending', 'Waiting for approval'),
      makeElement('h3', '', 'Request sent'),
      makeElement('p', '', `Your teacher received your request at ${formatTime(pass.requestedAt)}. Please wait for approval.`),
      makeElement('p', 'weekly-usage', weeklyUsageMessage(passes, pass.student))
    );
    requestButton.disabled = true;
    return;
  }

  if (pass.status === 'approved') {
    const details = makeElement('p', 'approval-time', `Approved at ${formatTime(pass.approvedAt)}. You may leave now.`);
    const returnButton = makeElement('button', 'button button-primary', 'I’m back — check me in');
    returnButton.type = 'button';
    returnButton.dataset.action = 'return';
    returnButton.dataset.passId = pass.id;
    studentStatus.append(
      makeElement('span', 'badge badge-approved', 'Approved'),
      makeElement('h3', '', 'You’re cleared to go'),
      details,
      makeElement('p', 'weekly-usage', weeklyUsageMessage(passes, pass.student)),
      returnButton
    );
    requestButton.disabled = true;
    return;
  }

  if (pass.status === 'denied') {
    const limitReached = weeklyPassCount(passes, pass.student) >= WEEKLY_PASS_LIMIT;
    studentStatus.append(
      makeElement('span', 'badge badge-denied', 'Not approved'),
      makeElement('h3', '', 'Please stay in class'),
      makeElement('p', '', limitReached
        ? `You’ve used all ${WEEKLY_PASS_LIMIT} passes for this week.`
        : 'Your teacher didn’t approve this request. You can ask again if you still need to go.'),
      makeElement('p', 'weekly-usage', weeklyUsageMessage(passes, pass.student))
    );
    requestButton.disabled = limitReached;
    return;
  }

  studentStatus.append(
    makeElement('span', 'badge badge-returned', 'Checked in'),
    makeElement('h3', '', 'Welcome back'),
    makeElement('p', '', `You checked back in at ${formatTime(pass.returnedAt)}. You can request another pass if needed.`),
    makeElement('p', 'weekly-usage', weeklyUsageMessage(passes, pass.student))
  );
  requestButton.disabled = weeklyPassCount(passes, pass.student) >= WEEKLY_PASS_LIMIT;
}

function makePassCard(pass, mode, passes) {
  const card = makeElement('article', 'pass-item');
  const details = makeElement('div', 'pass-details');
  const used = weeklyPassCount(passes, pass.student);
  details.append(
    makeElement('strong', 'pass-name', pass.student),
    makeElement('span', 'pass-time', `Requested ${formatTime(pass.requestedAt)}`)
  );
  details.append(makeElement('span', 'weekly-usage', `This week: ${used}/${WEEKLY_PASS_LIMIT} passes used`));
  if (pass.reason) {
    details.append(makeElement('span', 'pass-reason', `Reason: ${pass.reason}`));
  }
  card.append(details);

  if (mode === 'pending') {
    const actions = makeElement('div', 'pass-actions');
    const approveButton = makeElement('button', 'button button-approve', 'Approve');
    approveButton.type = 'button';
    approveButton.dataset.action = 'approve';
    approveButton.dataset.passId = pass.id;
    approveButton.disabled = used >= WEEKLY_PASS_LIMIT;
    if (approveButton.disabled) {
      approveButton.title = 'This student has reached the weekly pass limit.';
    }

    const timeLimit = makeElement('label', 'time-limit-control');
    timeLimit.append(makeElement('span', '', 'Time allowed (min)'));
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.name = 'allowedMinutes';
    durationInput.min = '1';
    durationInput.max = String(MAX_PASS_MINUTES);
    durationInput.step = '1';
    durationInput.value = String(DEFAULT_PASS_MINUTES);
    durationInput.required = true;
    durationInput.setAttribute('aria-label', `Time allowed for ${pass.student} in minutes`);
    durationInput.dataset.passId = pass.id;
    timeLimit.append(durationInput);

    const denyButton = makeElement('button', 'button button-deny', 'Deny');
    denyButton.type = 'button';
    denyButton.dataset.action = 'deny';
    denyButton.dataset.passId = pass.id;
    actions.append(timeLimit, approveButton, denyButton);
    card.append(actions);
  } else if (mode === 'active') {
    const activeDetails = makeElement('div', 'active-pass-details');
    const approvedAt = pass.approvedAt || pass.requestedAt;
    const allowedMinutes = Number.isInteger(pass.allowedMinutes) && pass.allowedMinutes > 0
      ? pass.allowedMinutes
      : DEFAULT_PASS_MINUTES;
    activeDetails.dataset.approvedAt = String(approvedAt);
    activeDetails.dataset.allowedMinutes = String(allowedMinutes);
    activeDetails.append(makeElement('span', 'badge badge-approved', `Approved ${formatTime(approvedAt)}`));
    card.classList.toggle('pass-overdue', Date.now() - approvedAt > allowedMinutes * 60_000);
    card.append(activeDetails);
    updateActiveTimer(activeDetails);
  } else {
    if (pass.status === 'returned') {
      const timing = getCheckInTiming(pass);
      card.append(
        makeElement('span', `badge ${timing.className}`, `Checked in · ${timing.label} · ${formatTime(pass.returnedAt)}`)
      );
    } else {
      card.append(makeElement('span', 'badge badge-denied', `Not approved · ${formatTime(pass.requestedAt)}`));
    }
  }

  return card;
}

function updateActiveTimer(activeDetails) {
  const approvedAt = Number(activeDetails.dataset.approvedAt);
  const allowedMinutes = Number(activeDetails.dataset.allowedMinutes);
  const elapsed = Date.now() - approvedAt;
  const remaining = allowedMinutes * 60_000 - elapsed;
  const card = activeDetails.closest('.pass-item');
  const elapsedLabel = remaining >= 0
    ? `Out ${formatDuration(elapsed)} · ${formatDuration(remaining)} left`
    : `Over time by ${formatDuration(-remaining)}`;
  let timer = activeDetails.querySelector('.elapsed-time');

  if (!timer) {
    timer = makeElement('span', 'elapsed-time');
    activeDetails.append(timer);
  }

  timer.textContent = elapsedLabel;
  card.classList.toggle('pass-overdue', remaining < 0);
}

function renderTeacherDashboard(passes) {
  const pending = passes.filter((pass) => pass.status === 'pending').sort((a, b) => a.requestedAt - b.requestedAt);
  const active = passes.filter((pass) => pass.status === 'approved').sort((a, b) => a.approvedAt - b.approvedAt);
  const history = passes
    .filter((pass) => pass.status === 'returned' || pass.status === 'denied')
    .sort((a, b) => (b.returnedAt || b.requestedAt) - (a.returnedAt || a.requestedAt))
    .slice(0, 8);

  pendingCount.textContent = String(pending.length);
  requestList.replaceChildren(...(pending.length ? pending.map((pass) => makePassCard(pass, 'pending', passes)) : [makeEmptyState('No requests waiting. You’re all caught up.')]));
  activeList.replaceChildren(...(active.length ? active.map((pass) => makePassCard(pass, 'active', passes)) : [makeEmptyState('No students are out right now.')]));
  historyList.replaceChildren(...(history.length ? history.map((pass) => makePassCard(pass, 'history', passes)) : [makeEmptyState('Completed passes will appear here.')]));
}

function render() {
  try {
    const passes = readPasses();
    clearStorageError();
    renderStudentStatus(passes);
    renderTeacherDashboard(passes);
  } catch (error) {
    showStorageError(error);
  }
}

function updatePass(passId, nextStatus) {
  const passes = readPasses();
  const pass = passes.find((item) => item.id === passId);
  if (!pass || pass.status !== (nextStatus === 'returned' ? 'approved' : 'pending')) {
    render();
    return;
  }

  if (nextStatus === 'approved' && weeklyPassCount(passes, pass.student) >= WEEKLY_PASS_LIMIT) {
    teacherNotice.textContent = `${pass.student} has reached the weekly limit of ${WEEKLY_PASS_LIMIT} approved passes.`;
    teacherNotice.hidden = false;
    render();
    return;
  }

  if (nextStatus === 'approved') {
    const durationInput = requestList.querySelector(
      `input[name="allowedMinutes"][data-pass-id="${CSS.escape(passId)}"]`
    );
    const allowedMinutes = Number(durationInput?.value);
    if (!durationInput || !Number.isInteger(allowedMinutes)
      || allowedMinutes < 1 || allowedMinutes > MAX_PASS_MINUTES) {
      durationInput?.reportValidity();
      return;
    }
    pass.allowedMinutes = allowedMinutes;
  }

  teacherNotice.textContent = '';
  teacherNotice.hidden = true;
  pass.status = nextStatus;
  if (nextStatus === 'approved') {
    pass.approvedAt = Date.now();
  } else if (nextStatus === 'returned') {
    pass.returnedAt = Date.now();
  }

  savePasses(passes);
  render();
}

roleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const showTeacher = button.dataset.role === 'teacher';
    studentView.hidden = showTeacher;
    teacherView.hidden = !showTeacher;

    roleButtons.forEach((roleButton) => {
      const selected = roleButton === button;
      roleButton.classList.toggle('is-selected', selected);
      roleButton.setAttribute('aria-pressed', String(selected));
    });
  });
});

studentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const student = studentNameInput.value.trim();
  const reason = passReasonInput.value.trim();
  if (!student || !reason) {
    (student ? passReasonInput : studentNameInput).focus();
    return;
  }

  try {
    const passes = readPasses();
    const alreadyOutOrWaiting = passes.some((pass) => (
      pass.student.trim().toLocaleLowerCase() === student.toLocaleLowerCase()
      && (pass.status === 'pending' || pass.status === 'approved')
    ));

    if (alreadyOutOrWaiting) {
      render();
      return;
    }

    if (weeklyPassCount(passes, student) >= WEEKLY_PASS_LIMIT) {
      render();
      return;
    }

    passes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      student,
      reason,
      status: 'pending',
      requestedAt: Date.now(),
    });
    savePasses(passes);
    render();
  } catch (error) {
    showStorageError(error);
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  try {
    if (button.dataset.action === 'approve') {
      updatePass(button.dataset.passId, 'approved');
    } else if (button.dataset.action === 'deny') {
      updatePass(button.dataset.passId, 'denied');
    } else if (button.dataset.action === 'return') {
      updatePass(button.dataset.passId, 'returned');
    }
  } catch (error) {
    showStorageError(error);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('input[name="allowedMinutes"]')) {
    event.target.setCustomValidity('');
  }
});

studentNameInput.addEventListener('input', render);

window.setInterval(() => {
  document.querySelectorAll('.active-pass-details').forEach(updateActiveTimer);
}, 60_000);

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    render();
  }
});

render();
