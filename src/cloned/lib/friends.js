// Local friends list (per logged-in user) — stored in localStorage.
// Lightweight, no DB schema changes required.

const keyFor = (myId) => `svc:friends:${myId || 'anon'}:v1`;

export function getFriends(myId) {
  try {
    const raw = localStorage.getItem(keyFor(myId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isFriend(myId, otherId) {
  if (!myId || !otherId) return false;
  return getFriends(myId).some((f) => f.user_id === otherId);
}

export function addFriend(myId, friend) {
  if (!myId || !friend?.user_id) return false;
  const list = getFriends(myId);
  if (list.some((f) => f.user_id === friend.user_id)) return false;
  const next = [
    { user_id: friend.user_id, display_name: friend.display_name || '', avatar_url: friend.avatar_url || null, added_at: Date.now() },
    ...list,
  ];
  localStorage.setItem(keyFor(myId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('svc:friends-change'));
  return true;
}

export function removeFriend(myId, otherId) {
  if (!myId || !otherId) return false;
  const next = getFriends(myId).filter((f) => f.user_id !== otherId);
  localStorage.setItem(keyFor(myId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('svc:friends-change'));
  return true;
}
