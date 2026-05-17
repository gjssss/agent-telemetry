import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  TIME_RANGES,
  type TimeRange,
  formatCost,
  formatInteger,
  getProfile,
  updateCurrentUserName,
} from '@/lib/telemetry-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'

function ProfileRoute() {
  const [range, setRange] = useState<TimeRange>('7d')
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.auth.setUser)
  const currentUser = useAuthStore((state) => state.auth.user)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['profile', range],
    queryFn: () => getProfile(range),
  })

  useEffect(() => {
    if (data?.user) {
      setName(data.user.name ?? data.user.email)
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name ?? data.user.email,
        role: currentUser?.role ?? ['user'],
        exp: currentUser?.exp ?? Date.now() + 24 * 60 * 60 * 1000,
      })
    }
  }, [currentUser?.exp, currentUser?.role, data?.user, setUser])

  const mutation = useMutation({
    mutationFn: updateCurrentUserName,
    onSuccess: async (user) => {
      setUser({
        id: user.id,
        email: user.email,
        name: user.name ?? user.email,
        role: currentUser?.role ?? ['user'],
        exp: currentUser?.exp ?? Date.now() + 24 * 60 * 60 * 1000,
      })
      setName(user.name ?? user.email)
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('昵称已更新。')
    },
  })

  const summary = data?.summary
  const batches = data?.recent_batches ?? []
  const user = data?.user
  const trimmedName = name.trim()
  const canSave =
    !!trimmedName &&
    trimmedName !== (user?.name ?? user?.email ?? '') &&
    !mutation.isPending

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSave) {
      mutation.mutate(trimmedName)
    }
  }

  return (
    <>
      <Header>
        <div className='text-sm font-medium'>个人页</div>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>个人页</h1>
            <p className='text-sm text-muted-foreground'>
              查看当前账号信息，编辑昵称，并检查最近上传批次。
            </p>
          </div>
          <Tabs
            value={range}
            onValueChange={(value) => setRange(value as TimeRange)}
          >
            <TabsList>
              {TIME_RANGES.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertTriangle className='size-4' />
            <AlertTitle>个人数据加载失败</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : '无法读取个人页数据。'}
            </AlertDescription>
          </Alert>
        )}

        {mutation.isError && (
          <Alert variant='destructive' className='mb-4'>
            <AlertTriangle className='size-4' />
            <AlertTitle>昵称更新失败</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof Error
                ? mutation.error.message
                : '无法更新昵称。'}
            </AlertDescription>
          </Alert>
        )}

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'>
          <Card>
            <CardHeader>
              <CardTitle>当前用户</CardTitle>
            </CardHeader>
            <CardContent className='space-y-5'>
              <div className='space-y-1'>
                <div className='text-sm text-muted-foreground'>邮箱</div>
                <div className='font-medium'>{user?.email ?? '加载中...'}</div>
              </div>
              <form className='space-y-3' onSubmit={handleSubmit}>
                <div className='space-y-2'>
                  <Label htmlFor='profile-name'>昵称</Label>
                  <Input
                    id='profile-name'
                    value={name}
                    disabled={isLoading}
                    onChange={(event) => setName(event.target.value)}
                    placeholder='输入昵称'
                  />
                </div>
                <Button type='submit' disabled={!canSave}>
                  {mutation.isPending ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <Save />
                  )}
                  保存昵称
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>个人统计</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>总费用</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatCost(summary?.total_cost)}
                </div>
              </div>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>总 Token</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatInteger(summary?.total_tokens)}
                </div>
              </div>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>Sessions</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatInteger(summary?.session_count)}
                </div>
              </div>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>模型数</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatInteger(summary?.model_count)}
                </div>
              </div>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>API 调用</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatInteger(summary?.api_call_count)}
                </div>
              </div>
              <div className='rounded-md border bg-muted/20 p-3'>
                <div className='text-sm text-muted-foreground'>工具调用</div>
                <div className='mt-1 text-2xl font-bold'>
                  {formatInteger(summary?.tool_call_count)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>最近上传批次</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>完成时间</TableHead>
                  <TableHead className='text-end'>接收</TableHead>
                  <TableHead className='text-end'>新增</TableHead>
                  <TableHead className='text-end'>更新</TableHead>
                  <TableHead className='text-end'>错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className='font-medium'>
                      {batch.provider}
                    </TableCell>
                    <TableCell>
                      {new Date(batch.completed_at).toLocaleString()}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatInteger(batch.received_count)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatInteger(batch.inserted_count)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatInteger(batch.updated_count)}
                    </TableCell>
                    <TableCell className='text-end'>
                      {formatInteger(batch.error_count)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!isLoading && batches.length === 0 && (
              <p className='mt-4 text-sm text-muted-foreground'>
                暂无上传批次。
              </p>
            )}
            {isLoading && (
              <p className='mt-4 text-sm text-muted-foreground'>
                正在加载个人数据...
              </p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfileRoute,
})
