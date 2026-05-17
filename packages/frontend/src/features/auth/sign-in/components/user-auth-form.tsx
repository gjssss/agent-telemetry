import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email' : undefined),
  }),
  password: z
    .string()
    .min(1, 'Please enter your password')
    .min(7, 'Password must be at least 7 characters long'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function loadCurrentUser() {
    const response = await fetch('/api/me', {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error('Unable to load current user.')
    }

    const result = (await response.json()) as {
      session?: { expiresAt?: string }
      user?: { id: string; email: string; name?: string | null }
    }

    if (!result.user) {
      throw new Error('Unable to load current user.')
    }

    auth.setUser({
      id: result.user.id,
      email: result.user.email,
      name: result.user.name ?? result.user.email,
      role: ['user'],
      exp: result.session?.expiresAt
        ? new Date(result.session.expiresAt).getTime()
        : Date.now() + 24 * 60 * 60 * 1000,
    })
    auth.setAccessToken('cookie-session')
  }

  async function signIn(data: z.infer<typeof formSchema>) {
    const response = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        message?: string
        error?: string
      } | null
      throw new Error(result?.message ?? result?.error ?? 'Sign in failed.')
    }
  }

  async function register(data: z.infer<typeof formSchema>) {
    const response = await fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        name: data.email,
      }),
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        message?: string
        error?: string
        code?: string
      } | null
      const message = result?.message ?? result?.error ?? ''
      const alreadyExists =
        result?.code === 'USER_ALREADY_EXISTS' ||
        /already|exist|taken|duplicate/i.test(message)
      throw new Error(
        alreadyExists
          ? 'This email is already registered.'
          : message || 'Register failed.'
      )
    }
  }

  async function handleAuth(
    data: z.infer<typeof formSchema>,
    mode: 'sign-in' | 'register'
  ) {
    setIsLoading(true)
    setIsRegistering(mode === 'register')
    setServerError(null)

    try {
      if (mode === 'register') {
        await register(data)
      } else {
        await signIn(data)
      }

      await loadCurrentUser()
      navigate({ to: redirectTo || '/', replace: true })
      toast.success(mode === 'register' ? 'Account created.' : 'Signed in.')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed.'
      setServerError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
      setIsRegistering(false)
    }
  }

  function onSubmit(data: z.infer<typeof formSchema>) {
    void handleAuth(data, 'sign-in')
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
            {serverError}
          </p>
        )}
        <div className='mt-2 grid gap-2 sm:grid-cols-2'>
          <Button disabled={isLoading}>
            {isLoading && !isRegistering ? (
              <Loader2 className='animate-spin' />
            ) : (
              <LogIn />
            )}
            Sign in
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={isLoading}
            onClick={form.handleSubmit((data) => handleAuth(data, 'register'))}
          >
            {isLoading && isRegistering ? (
              <Loader2 className='animate-spin' />
            ) : (
              <UserPlus />
            )}
            Register
          </Button>
        </div>
      </form>
    </Form>
  )
}
