'use server'

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { inngest } from '@/lib/inngest/client'

export const signUpWithEmail = async ({ email, password, fullName }: SignUpFormData) => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (error) return { success: false, error: error.message }
    if (!data.user) return { success: false, error: 'Sign up failed' }

    await prisma.user.create({
      data: { id: data.user.id, email, name: fullName },
    })

    await inngest.send({
      name: 'app/user.created',
      data: { email, name: fullName },
    })

    return { success: true, data }
  } catch (e) {
    console.error('Sign up failed', e)
    return { success: false, error: 'Sign up failed' }
  }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (e) {
    console.error('Sign in failed', e)
    return { success: false, error: 'Sign in failed' }
  }
}

export const signOut = async () => {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch (e) {
    console.error('Sign out failed', e)
    return { success: false, error: 'Sign out failed' }
  }
}
