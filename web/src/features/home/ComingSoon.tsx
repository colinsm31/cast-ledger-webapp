import { EmptyState } from '../../components/EmptyState';

// Placeholder for retail screens still being built in later steps.
export function ComingSoon({ title }: { title: string }) {
  return <EmptyState title={title} message="This screen is coming next in the AceStock build." />;
}
