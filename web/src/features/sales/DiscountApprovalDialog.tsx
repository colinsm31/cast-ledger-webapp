import { approveDiscountAsAdmin } from '../../lib/discountApproval';
import { AdminApprovalDialog } from '../../components/AdminApprovalDialog';

// An admin signs in here to approve a discount over the staff limit. The
// register stays signed in as the staff member (see lib/discountApproval).
export function DiscountApprovalDialog({
  percent,
  staffLimit,
  onApproved,
  onCancel,
}: {
  /** How far below catalog the ticket goes, in percent. */
  percent: number;
  staffLimit: number | null;
  onApproved: (approvalId: string) => void;
  onCancel: () => void;
}) {
  return (
    <AdminApprovalDialog
      message={
        <>
          This ticket goes {percent}% below catalog price
          {staffLimit != null ? `, over the staff limit of ${staffLimit}%` : ''}. An admin can approve it by signing in
          here. You stay signed in, and the approval covers this ticket only.
        </>
      }
      approveLabel={`Approve ${percent}% off`}
      approve={(credentials) => approveDiscountAsAdmin({ ...credentials, maxPercent: percent })}
      onApproved={onApproved}
      onCancel={onCancel}
    />
  );
}
