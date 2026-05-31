defmodule Backend.Repo.Migrations.AddPixKeyToOrganizations do
  use Ecto.Migration

  def change do
    alter table(:organizations) do
      add :pix_key, :string
      add :pix_key_type, :string, size: 10
    end

    create constraint(:organizations, :pix_key_type_valid,
             check:
               "pix_key_type IS NULL OR pix_key_type IN ('cpf','cnpj','email','phone','evp')"
           )

    create constraint(:organizations, :pix_key_pair_consistency,
             check:
               "(pix_key IS NULL AND pix_key_type IS NULL) OR (pix_key IS NOT NULL AND pix_key_type IS NOT NULL)"
           )
  end
end
