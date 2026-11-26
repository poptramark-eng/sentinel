import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from "@nestjs/common";

/**
 * Production release gate for processing learner, candidate, marks and results data.
 * Non-production environments remain usable with synthetic fixtures. Production
 * stays fail-closed until the responsible privacy/legal owners approve onboarding.
 */
@Injectable()
export class ChildDataProcessingGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.CHILD_DATA_PROCESSING_ENABLED?.trim().toLowerCase() === "true") {
      return true;
    }

    if (process.env.NODE_ENV !== "production") {
      return true;
    }

    throw new ServiceUnavailableException(
      "Learner and assessment data processing is disabled until the child-data privacy release gates are approved.",
    );
  }
}
