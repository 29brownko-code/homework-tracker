'use strict';

const STORAGE_KEY = 'coursework-tracker-items-v1';
const form = document.querySelector('#assignment-form');
const titleInput = document.querySelector('#title');
const kindInput = document.querySelector('#kind');
const dueDateInput = document.querySelector('#due-date');
const notesInput = document.querySelector('#notes');
const list = document.querySelector('#assignment-list');
const formMessage = document.querySelector('#form-message');
const openCount = document.querySelector('#open-count');
const allCount = document.querySelector('#all-count');
const todayDate = document.querySelector('#today-date');
const filterButtons = [...document.querySelectorAll('[data-filter]')];

let assignments = loadAssignments();
let activeFilter = 'all';

function loadAssignments() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved)
      ? saved.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string'
        && typeof item.dueDate === 'string' && typeof item.completed === 'boolean')
      : [];
  } catch {
    return [];
  }
}

function saveAssignments() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
    return true;
  } catch {
    formMessage.textContent = 'Could not save in this browser. Check its storage settings.';
    return false;
  }
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(year, month - 1, day));
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function render() {
  list.replaceChildren();
  const openItems = assignments.filter((item) => !item.completed);
  const visibleItems = assignments
    .filter((item) => activeFilter === 'all'
      || (activeFilter === 'upcoming' && !item.completed)
      || (activeFilter === 'completed' && item.completed))
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate));

  openCount.textContent = String(openItems.length);
  allCount.textContent = String(assignments.length);

  if (visibleItems.length === 0) {
    const empty = createElement('div', 'empty-state');
    empty.append(createElement('span', 'empty-mark', activeFilter === 'completed' ? '✓' : '—'));
    empty.append(createElement('p', '', activeFilter === 'completed'
      ? 'Finished items will show up here.'
      : activeFilter === 'upcoming' ? 'You’re all caught up. Add a task when one comes along.' : 'Your list is clear. Add your first assignment to get started.'));
    list.append(empty);
    return;
  }

  for (const item of visibleItems) {
    const overdue = !item.completed && item.dueDate < localDateString(new Date());
    const row = createElement('article', `assignment-item${overdue ? ' is-overdue' : ''}${item.completed ? ' is-complete' : ''}`);
    const toggle = createElement('button', 'check-button');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', item.completed ? `Mark ${item.title} as to do` : `Mark ${item.title} complete`);
    toggle.setAttribute('aria-pressed', String(item.completed));
    toggle.append(createElement('span', '', item.completed ? '✓' : ''));
    toggle.addEventListener('click', () => updateAssignment(item.id, { completed: !item.completed }));

    const main = createElement('div', 'item-main');
    main.append(createElement('h3', 'item-title', item.title));
    const meta = createElement('div', 'item-meta');
    const kindLabel = ['Assignment', 'Project', 'Upcoming Quizes'].includes(item.kind) ? item.kind : 'Assignment';
    meta.append(createElement('span', 'item-kind', kindLabel));
    const dueText = overdue ? `Overdue · ${formatDate(item.dueDate)}` : `Due ${formatDate(item.dueDate)}`;
    meta.append(createElement('span', 'due-label', dueText));
    main.append(meta);
    if (item.notes) main.append(createElement('p', 'item-notes', item.notes));

    const remove = createElement('button', 'delete-button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${item.title}`);
    remove.title = 'Delete';
    remove.addEventListener('click', () => deleteAssignment(item.id));

    row.append(toggle, main, remove);
    list.append(row);
  }
}

function updateAssignment(id, changes) {
  assignments = assignments.map((item) => item.id === id ? { ...item, ...changes } : item);
  saveAssignments();
  render();
}

function deleteAssignment(id) {
  assignments = assignments.filter((item) => item.id !== id);
  saveAssignments();
  render();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title || !dueDateInput.value) return;

  assignments.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    kind: kindInput.value,
    dueDate: dueDateInput.value,
    notes: notesInput.value.trim(),
    completed: false,
  });
  saveAssignments();
  form.reset();
  dueDateInput.value = localDateString(new Date());
  formMessage.textContent = 'Added to your list.';
  activeFilter = 'all';
  updateFilterButtons();
  render();
  titleInput.focus();
});

function updateFilterButtons() {
  for (const button of filterButtons) {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    updateFilterButtons();
    render();
  });
}

todayDate.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
dueDateInput.value = localDateString(new Date());
render();