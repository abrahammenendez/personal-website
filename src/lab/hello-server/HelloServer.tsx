import * as Sentry from '@sentry/tanstackstart-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { RefreshCwIcon, SendIcon, TriangleAlertIcon } from 'lucide-react'
import type { SubmitEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { echoMessage, getServerInfo } from './api'

export function HelloServer() {
  return (
    <div className="flex flex-col gap-4">
      <ReadCard />
      <WriteCard />
      <SentryCard />
    </div>
  )
}

function ReadCard() {
  const query = useQuery({
    queryKey: ['hello-server', 'server-info'],
    queryFn: () => getServerInfo(),
  })

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Read, server info</CardTitle>
        <CardDescription>Fetched from a GET server function running on the Worker.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <p className="text-destructive text-sm">Failed to load: {query.error.message}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="font-mono">{query.data ? query.data.now : '…'}</dd>
            <dt className="text-muted-foreground">Random</dt>
            <dd className="font-mono">{query.data ? query.data.random : '…'}</dd>
          </dl>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCwIcon data-icon="inline-start" />
          {query.isFetching ? 'Fetching…' : 'Fetch again'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function WriteCard() {
  const [message, setMessage] = useState('')

  const mutation = useMutation({
    mutationFn: (value: string) => echoMessage({ data: { message: value } }),
    onSuccess: (result) => toast.success(`Server echoed: ${result.received}`),
  })

  function onSubmit(event: SubmitEvent) {
    event.preventDefault()
    mutation.mutate(message)
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Write, echo a message</CardTitle>
        <CardDescription>
          Posted to a server function that validates the input server-side.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={mutation.isError || undefined}>
            <FieldLabel htmlFor="echo-message">Message</FieldLabel>
            <Input
              id="echo-message"
              value={message}
              // Base UI's Input reports changes via onValueChange(value), not
              // onChange(event). The Radix/Base UI difference to watch for.
              onValueChange={setMessage}
              placeholder="Type something"
              aria-invalid={mutation.isError || undefined}
            />
            {mutation.isError ? <FieldError>{mutation.error.message}</FieldError> : null}
          </Field>
          {mutation.data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Received</dt>
              <dd className="font-mono">{mutation.data.received}</dd>
              <dt className="text-muted-foreground">Length</dt>
              <dd className="font-mono">{mutation.data.length}</dd>
            </dl>
          ) : null}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={mutation.isPending}>
            <SendIcon data-icon="inline-start" />
            {mutation.isPending ? 'Sending…' : 'Send to server'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function triggerTestError() {
  // Captured rather than thrown, so the page never crashes. A no-op in
  // development, where Sentry does not initialise.
  Sentry.captureException(new Error('hello-server: intentional test error'))
  toast.success('Sent a test error to Sentry')
}

function SentryCard() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Observability, Sentry</CardTitle>
        <CardDescription>Sends a captured exception to the Sentry project.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" onClick={triggerTestError}>
          <TriangleAlertIcon data-icon="inline-start" />
          Trigger test error
        </Button>
      </CardFooter>
    </Card>
  )
}
