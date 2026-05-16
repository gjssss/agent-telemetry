import { useQuery } from '@tanstack/react-query'
import { formatBackendStatus } from '@auto-code/core'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type BackendHello = {
  message: string
  time: string
}

async function fetchBackendHello(): Promise<BackendHello> {
  const response = await fetch('/api/hello')
  if (!response.ok) {
    throw new Error('Failed to fetch backend status')
  }
  return response.json() as Promise<BackendHello>
}

export function BackendStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backend', 'hello'],
    queryFn: fetchBackendHello,
  })

  let title = 'Ready'
  let subtitle = 'Waiting for server response'

  if (isLoading) {
    title = 'Loading...'
    subtitle = 'Fetching backend status'
  }

  if (isError) {
    title = 'Unavailable'
    subtitle = 'Backend is not responding'
  }

  if (data) {
    const formatted = formatBackendStatus(data)
    title = formatted.title
    subtitle = formatted.subtitle
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>Backend Status</CardTitle>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='2'
          className='h-4 w-4 text-muted-foreground'
        >
          <path d='M4 6h16' />
          <path d='M4 12h16' />
          <path d='M4 18h16' />
        </svg>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{title}</div>
        <p className='text-xs text-muted-foreground'>{subtitle}</p>
      </CardContent>
    </Card>
  )
}
