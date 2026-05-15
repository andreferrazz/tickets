defmodule Backend.Webhooks do
  @moduledoc "Persistence for inbound webhook events (audit + replay)."

  alias Backend.Repo
  alias Backend.Webhooks.Event

  @doc """
  Persists a verified webhook payload. Returns `{:ok, event}` or `{:error, changeset}`.
  `event_type` is pulled from the top-level `"event"` key when present.
  """
  def log_event(params) when is_map(params) do
    %Event{}
    |> Event.changeset(%{
      event_type: Map.get(params, "event"),
      payload: params
    })
    |> Repo.insert()
  end
end
