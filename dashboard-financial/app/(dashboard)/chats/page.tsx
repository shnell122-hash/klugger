import { api, type Chat } from '@/lib/api';
import ChatsClient from './ChatsClient';


export default async function ChatsPage() {
  let chats: Chat[] = [];
  try { chats = await api.getChats(200); } catch (_) {}
  return <ChatsClient initialChats={chats} />;
}
