import { jobSideToRow, type RowSel } from './stringJobForm';
import type { StringSetup } from './stringSummary';

/** The columns to read for a past job's setup. */
export const SETUP_COLUMNS =
  'main_brand, main_string, main_specs, main_tension, main_customer_supplied, ' +
  'cross_brand, cross_string, cross_specs, cross_tension, cross_customer_supplied';

export interface SetupRows {
  mains: RowSel;
  crosses: RowSel;
  /** The crosses differ from the mains, so they stop copying them. */
  crossStringEdited: boolean;
  crossTensionEdited: boolean;
}

/**
 * A past job's setup as the drop-off form's rows ("same as last time"). A job
 * with no crosses recorded strings the crosses like the mains.
 */
export function setupToRows(job: StringSetup): SetupRows {
  const mains = jobSideToRow(job.main_brand, job.main_string, job.main_specs, job.main_tension, job.main_customer_supplied);
  const crosses = jobSideToRow(
    job.cross_brand,
    job.cross_string,
    job.cross_specs,
    job.cross_tension,
    job.cross_customer_supplied,
  );
  if (!crosses.name) {
    return { mains, crosses: { ...mains }, crossStringEdited: false, crossTensionEdited: false };
  }
  const sameString =
    mains.brand === crosses.brand &&
    mains.name === crosses.name &&
    mains.customer === crosses.customer &&
    JSON.stringify(mains.specs) === JSON.stringify(crosses.specs);
  return {
    mains,
    crosses,
    crossStringEdited: !sameString,
    crossTensionEdited: mains.tension !== crosses.tension,
  };
}
