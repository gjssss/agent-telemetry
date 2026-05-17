import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
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

const formSchema = z
  .object({
    email: z.email({
      error: (iss) =>
        iss.input === '' ? 'Please enter your email' : undefined,
    }),
    password: z
      .string()
      .min(1, 'Please enter your password')
      .min(7, 'Password must be at least 7 characters long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })

export function SignUpForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    setServerError(null)

    try {
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

      const currentUserResponse = await fetch('/api/me', {
        credentials: 'include',
      })
      const currentUser = (await currentUserResponse.json()) as {
        session?: { expiresAt?: string }
        user?: { id: string; email: string; name?: string | null }
      }

      if (!currentUser.user) {
        throw new Error('Unable to load current user.')
      }

      auth.setUser({
        id: currentUser.user.id,
        email: currentUser.user.email,
        name: currentUser.user.name ?? currentUser.user.email,
        role: ['user'],
        exp: currentUser.session?.expiresAt
          ? new Date(currentUser.session.expiresAt).getTime()
          : Date.now() + 24 * 60 * 60 * 1000,
      })
      auth.setAccessToken('cookie-session')
      toast.success('Account created.')
      navigate({ to: '/', replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Register failed.'
      setServerError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
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
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading && <Loader2 className='animate-spin' />}
          Create Account
        </Button>
        {serverError && (
          <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
            {serverError}
          </p>
        )}
      </form>
    </Form>
  )
}
