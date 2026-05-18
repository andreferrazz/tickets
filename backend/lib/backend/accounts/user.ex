defmodule Backend.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :email, :string
    field :role, :string, default: "buyer"
    field :name, :string
    field :cellphone, :string
    field :tax_id, :string
    field :abacate_customer_id, :string
    belongs_to :invited_by_user, Backend.Accounts.User, foreign_key: :invited_by

    timestamps(type: :utc_datetime)
  end

  @valid_roles ~w(buyer creator admin)

  def changeset(user \\ %__MODULE__{}, attrs) do
    user
    |> cast(attrs, [:email, :role, :invited_by])
    |> validate_required([:email])
    |> validate_format(:email, ~r/@/)
    |> validate_inclusion(:role, @valid_roles)
    |> unique_constraint(:email)
  end

  @doc """
  Changeset for the post-signup profile step: name, cellphone, tax_id.

  Trims `name`, strips non-digits from `tax_id`, normalizes `cellphone` to
  DDD + number (`DDDXXXXXXXXX`, 11 digits, no country code) for Brazilian
  mobiles, and validates the tax_id is a checksum-valid CPF (11 digits) or
  CNPJ (14 digits). Catching bad values here avoids a round-trip to Abacate
  Pay for obvious typos.
  """
  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, [:name, :cellphone, :tax_id])
    |> validate_required([:name, :cellphone, :tax_id])
    |> update_change(:name, &trim_or_nil/1)
    |> update_change(:tax_id, &digits_or_nil/1)
    |> validate_length(:name, min: 2, max: 255)
    |> validate_change(:tax_id, &validate_tax_id/2)
    |> normalize_cellphone()
  end

  defp validate_tax_id(:tax_id, value) do
    if Backend.BrazilianTaxId.valid?(value) do
      []
    else
      [tax_id: "must be a valid CPF (11 digits) or CNPJ (14 digits)"]
    end
  end

  defp normalize_cellphone(changeset) do
    case get_change(changeset, :cellphone) do
      nil ->
        changeset

      value ->
        case Backend.BrazilianCellphone.normalize(value) do
          {:ok, e164} -> put_change(changeset, :cellphone, e164)
          :error -> add_error(changeset, :cellphone, "must be a valid Brazilian mobile")
        end
    end
  end

  @doc """
  Returns true when the user is registered with Abacate Pay. The customer id
  is only written together with name/cellphone/tax_id by `complete_profile/2`,
  so its presence is a strictly tighter "profile complete" signal than checking
  the three local fields.
  """
  def profile_complete?(%__MODULE__{abacate_customer_id: id}) when is_binary(id), do: true
  def profile_complete?(%__MODULE__{}), do: false

  defp trim_or_nil(nil), do: nil
  defp trim_or_nil(s), do: String.trim(s)

  defp digits_or_nil(nil), do: nil
  defp digits_or_nil(s), do: String.replace(s, ~r/\D/, "")
end
