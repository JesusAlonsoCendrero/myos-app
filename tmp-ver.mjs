import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: a } = await sb.auth.signInWithPassword({ email: process.env.VITE_AUTO_EMAIL, password: process.env.VITE_AUTO_PASSWORD })
const { data } = await sb.from('tasks').select('title,my_day_date,due_date,is_backlog').like('title', 'ZZ prueba%')
for (const t of data) console.log(`${t.title}  my_day=${t.my_day_date}  due=${t.due_date}  backlog=${t.is_backlog}`)
