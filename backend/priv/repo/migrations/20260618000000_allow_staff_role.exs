defmodule Backend.Repo.Migrations.AllowStaffRole do
  use Ecto.Migration

  # Adds the scan-only `staff` role to the membership and invitation role check
  # constraints. Staff can validate tickets but cannot manage events or the org.

  def up do
    drop constraint(:organization_memberships, :role_must_be_valid)

    create constraint(:organization_memberships, :role_must_be_valid,
             check: "role IN ('leader', 'participant', 'staff')"
           )

    drop constraint(:invitations, :invitation_role_must_be_valid)

    create constraint(:invitations, :invitation_role_must_be_valid,
             check: "role IN ('leader', 'participant', 'staff')"
           )
  end

  def down do
    drop constraint(:organization_memberships, :role_must_be_valid)

    create constraint(:organization_memberships, :role_must_be_valid,
             check: "role IN ('leader', 'participant')"
           )

    drop constraint(:invitations, :invitation_role_must_be_valid)

    create constraint(:invitations, :invitation_role_must_be_valid,
             check: "role IN ('leader', 'participant')"
           )
  end
end
