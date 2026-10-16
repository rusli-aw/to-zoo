/**
 * To-Zoo — group zoos.
 *
 * A group zoo is one shared enclosure: everyone who opens the invite link
 * sees the same animals, anyone can add a task, and anyone can send one home.
 * The link is the key — `?zoo=<id>` — so there are no accounts and nothing
 * to sign up for.
 *
 * Two backends behind one interface:
 *   - Supabase, when js/config.js has a URL and key: tasks live in a table
 *     behind id-gated functions; Realtime pings and Presence keep everyone
 *     in step and show who is here now.
 *   - Local test mode otherwise: localStorage plus a BroadcastChannel, so two
 *     tabs of the same browser behave like two people.
 *
 * The store stays the single source of truth for the views and the 3D
 * world; this module only mirrors task changes out and applies remote ones in.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import {
  applyRemoteTasks, enterGroup, getState, leaveGroup, subscribe, taskById,
} from './store.js';

export const isCloud = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** An unguessable id: 12 characters, ~71 bits. The link is the key. */
const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...bytes].map((b) => abc[b % abc.length]).join('');
};

export const inviteLink = (id) => `${location.origin}${location.pathname}?zoo=${id}`;

/** Pull a zoo id out of a pasted link or a bare id. */
export function parseInvite(text) {
  const m = String(text).match(/[?&]zoo=([a-z0-9]{6,32})/i) ?? String(text).trim().match(/^([a-z0-9]{6,32})$/i);
  return m ? m[1].toLowerCase() : null;
}

/* ============================================================ backends === */

function localBackend() {
  const key = (id) => `to-zoo:group:${id}`;
  const read = (id) => {
    try { return JSON.parse(localStorage.getItem(key(id))) ?? null; } catch { return null; }
  };
  const write = (id, data) => {
    try { localStorage.setItem(key(id), JSON.stringify(data)); } catch { /* full */ }
  };
  let channel = null;
  let me = null;
  const peers = new Map();
  let ping = null;
  let onStorage = null;

  return {
    async create(name) {
      const id = newId();
      write(id, { name, tasks: {} });
      return id;
    },
    async fetch(id) {
      const data = read(id);
      return data ? { name: data.name, tasks: Object.values(data.tasks) } : null;
    },
    async upsert(id, task) {
      const data = read(id) ?? { name: 'Group zoo', tasks: {} };
      data.tasks[task.id] = task;
      write(id, data);
    },
    async remove(id, taskId) {
      const data = read(id);
      if (!data) return;
      delete data.tasks[taskId];
      write(id, data);
    },
    listen(id, member, { onTasks, onPeople }) {
      me = { ...member, key: newId() };
      channel = new BroadcastChannel(`to-zoo:group:${id}`);
      const people = () => onPeople([me, ...[...peers.values()].map((p) => p.member)]);
      // Task changes: the storage event fires only once the other tab's write
      // is visible here (a channel message can arrive before it is).
      onStorage = (e) => {
        if (e.key !== key(id) || !e.newValue) return;
        try { onTasks(Object.values(JSON.parse(e.newValue).tasks ?? {})); } catch { /* ignore */ }
      };
      window.addEventListener('storage', onStorage);
      channel.onmessage = async (e) => {
        const msg = e.data;
        if (msg.kind === 'hello' || msg.kind === 'here') {
          peers.set(msg.member.key, { member: msg.member, seen: Date.now() });
          if (msg.kind === 'hello') channel.postMessage({ kind: 'here', member: me });
          people();
        }
        if (msg.kind === 'bye') { peers.delete(msg.key); people(); }
      };
      channel.postMessage({ kind: 'hello', member: me });
      // Heartbeat, so a closed tab drops off the list.
      ping = setInterval(() => {
        channel?.postMessage({ kind: 'here', member: me });
        for (const [k, p] of peers) if (Date.now() - p.seen > 12000) peers.delete(k);
        people();
      }, 5000);
      people();
    },
    stop() {
      if (onStorage) window.removeEventListener('storage', onStorage);
      onStorage = null;
      if (channel) channel.postMessage({ kind: 'bye', key: me?.key });
      channel?.close();
      channel = null;
      clearInterval(ping);
      peers.clear();
    },
  };
}

let supabaseLoading = null;
function loadSupabase() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  supabaseLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/supabase.umd.js';
    script.onload = () => (window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('supabase failed to load')));
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return supabaseLoading;
}

/**
 * Supabase: tables `zoos` and `zoo_tasks`, reached only through the RPC
 * functions in docs/group-zoo.sql (each needs the zoo id). Tasks are stored
 * whole as JSON. Live updates are a Realtime broadcast "changed" ping plus a
 * refetch; Presence shows who is here.
 */
function cloudBackend() {
  let client = null;
  let channel = null;
  const db = async () => {
    if (client) return client;
    const { createClient } = await loadSupabase();
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    return client;
  };
  const rpc = async (fn, args) => {
    const { data, error } = await (await db()).rpc(fn, args);
    if (error) throw error;
    return data;
  };
  /** Tell everyone else in the zoo to refetch. */
  const ping = () => channel?.send({ type: 'broadcast', event: 'changed', payload: {} });

  return {
    async create(name) {
      const id = newId();
      await rpc('create_zoo', { p_id: id, p_name: name });
      return id;
    },
    async fetch(id) {
      const rows = await rpc('get_zoo', { p_id: id });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row ? { name: row.name, tasks: row.tasks ?? [] } : null;
    },
    async upsert(id, task) {
      await rpc('put_zoo_task', {
        p_zoo: id, p_id: task.id, p_data: task,
        p_updated: new Date(task.updatedAt ?? Date.now()).toISOString(),
      });
      ping();
    },
    async remove(id, taskId) {
      await rpc('delete_zoo_task', { p_zoo: id, p_id: taskId });
      ping();
    },
    async listen(id, member, { onTasks, onPeople }) {
      const sb = await db();
      const me = { ...member, key: newId() };
      channel = sb.channel(`zoo:${id}`, { config: { presence: { key: me.key }, broadcast: { self: false } } });
      channel.on('broadcast', { event: 'changed' }, async () => {
        const zoo = await this.fetch(id);
        if (zoo) onTasks(zoo.tasks);
      });
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        onPeople(Object.values(state).map((list) => list[0]).filter(Boolean));
      });
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track(me);
      });
    },
    stop() {
      if (channel && client) client.removeChannel(channel);
      channel = null;
    },
  };
}

/* ============================================================== sync === */

/**
 * @param {object} hooks
 * @param {(people: {name: string, avatar: string}[]) => void} [hooks.onPeople]
 * @param {(err: unknown) => void} [hooks.onError]
 */
export function createGroupSync(hooks = {}) {
  const backend = isCloud() ? cloudBackend() : localBackend();
  let active = null;   // zoo id we are listening to
  let people = [];
  /** Task ids written locally but not yet confirmed by the backend. */
  const pending = new Set();
  const save = (id, task) => {
    pending.add(task.id);
    return backend.upsert(id, task).finally(() => pending.delete(task.id));
  };

  const member = () => ({ name: getState().user.name, avatar: getState().user.avatar });
  const fail = (err) => {
    console.error('[to-zoo] group sync', err);
    hooks.onError?.(err);
  };

  function listen(id) {
    if (active === id) return;
    backend.stop();
    active = id;
    Promise.resolve(backend.listen(id, member(), {
      onTasks: (tasks) => { if (active === id) applyRemoteTasks(tasks, pending); },
      onPeople: (list) => { people = list; hooks.onPeople?.(list); },
    })).catch(fail);
  }

  // Mirror local task edits out to the group. Remote applies are type
  // 'remote' and are not echoed back.
  subscribe((state, change) => {
    if (!state.group || state.group.id !== active) return;
    const id = active;
    const t = change.type;
    if (t === 'task:add' || t === 'task:update' || t === 'task:complete' || t === 'task:uncomplete') {
      const task = change.task?.id ? taskById(change.task.id) : taskById(change.id);
      if (task) save(id, task).catch(fail);
    } else if (t === 'task:delete') {
      backend.remove(id, change.id).catch(fail);
    } else if (t === 'task:reorder') {
      for (const task of state.tasks) save(id, task).catch(fail);
    }
  });

  // Already in a group from last time: reconnect.
  const current = getState().group;
  if (current) {
    backend.fetch(current.id)
      .then((zoo) => { if (zoo) applyRemoteTasks(zoo.tasks); })
      .catch(fail);
    listen(current.id);
  }

  return {
    get cloud() { return isCloud(); },
    get people() { return people; },

    /** Start a new group zoo, bringing nothing with you. */
    async create(name) {
      const id = await backend.create(name);
      enterGroup({ id, name }, []);
      listen(id);
      return id;
    },

    /** @returns {Promise<{id: string, name: string} | null>} null if no such zoo */
    async peek(id) {
      const zoo = await backend.fetch(id);
      return zoo ? { id, name: zoo.name, count: zoo.tasks.filter((t) => !t.completed).length } : null;
    },

    async join(id) {
      const zoo = await backend.fetch(id);
      if (!zoo) return null;
      enterGroup({ id, name: zoo.name }, zoo.tasks);
      listen(id);
      return zoo;
    },

    /** Re-join presence under the current name (after a rename). */
    reannounce() {
      const id = active;
      if (!id) return;
      active = null;
      listen(id);
    },

    leave() {
      backend.stop();
      active = null;
      people = [];
      hooks.onPeople?.([]);
      leaveGroup();
    },
  };
}
