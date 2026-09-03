import { Button } from '../../components/ui/button';
import { Toaster } from '../../components/ui/sonner';
import { toast } from '../../hooks/use-toast';
import { Row } from '../parts';

export function ToastDemo() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Row label="Notifications">
        <Button
          onClick={() =>
            toast({
              title: 'Changes saved',
              description: 'Your project settings are up to date.',
            })
          }
        >
          Show toast
        </Button>
        <Button
          variant="destructive"
          onClick={() =>
            toast({
              variant: 'destructive',
              title: 'Upload failed',
              description: 'The file could not be uploaded.',
              action: { label: 'Retry', onClick: () => undefined },
            })
          }
        >
          Show error
        </Button>
      </Row>
      <Toaster />
    </div>
  );
}
