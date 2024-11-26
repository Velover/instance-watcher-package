import Maid from "@rbxts/maid";
export const enum EChangeType {
	Added = "Added",
	Removed = "Removed",
	Changed = "Changed",
}

export type InstanceChangedEventHandler = (instance: Instance, change_type: EChangeType) => void;

export default class InstanceWatcher {
	private maid_ = new Maid();
	private instance_added_event_: BindableEvent<InstanceChangedEventHandler> = new Instance(
		"BindableEvent",
	);
	public readonly OnInstanceAdded = this.instance_added_event_.Event;

	private instance_removed_event_: BindableEvent<
		(instance: Instance, change_type: EChangeType, previous_parent: Instance) => void
	> = new Instance("BindableEvent");
	public readonly OnInstanceRemoved = this.instance_removed_event_.Event;

	private instance_changed_event_: BindableEvent<InstanceChangedEventHandler> = new Instance(
		"BindableEvent",
	);
	public readonly OnInstanceChanged = this.instance_changed_event_.Event;

	private event_: BindableEvent<InstanceChangedEventHandler> = new Instance("BindableEvent");
	public readonly OnEvent = this.event_.Event;

	private active_: boolean = true;
	public IsActive() {
		return this.active_;
	}

	public SetActive(value: boolean) {
		this.active_ = value;
	}

	private changed_connection_refferences_ = new Map<Instance, RBXScriptConnection>();

	private removing_connection_refferences_ = new Map<Instance, RBXScriptConnection>();

	private is_recursive_: boolean;

	constructor(parent_instance: Instance, is_recursive: boolean) {
		this.is_recursive_ = is_recursive;

		this.maid_.GiveTask(this.instance_added_event_);
		this.maid_.GiveTask(this.instance_removed_event_);
		this.maid_.GiveTask(this.instance_changed_event_);
		this.maid_.GiveTask(this.event_);
		this.maid_.GiveTask(() => {
			for (const [_, connection] of this.changed_connection_refferences_) {
				connection.Disconnect();
			}
			this.changed_connection_refferences_.clear();
		});

		this.maid_.GiveTask(() => {
			for (const [_, connection] of this.removing_connection_refferences_) {
				connection.Disconnect();
			}
			this.removing_connection_refferences_.clear();
		});

		if (!is_recursive) {
			this.InitializeNotRecursive(parent_instance);
			return;
		}
		this.InitializeRecursive(parent_instance);
	}

	private InitializeNotRecursive(parent_instance: Instance) {
		this.maid_.GiveTask(
			parent_instance.ChildAdded.Connect((child) => {
				this.InstanceAdded(child);
			}),
		);
		this.maid_.GiveTask(
			parent_instance.ChildRemoved.Connect((child) => {
				this.InstanceRemoved(child, parent_instance);
			}),
		);

		for (const child of parent_instance.GetChildren()) {
			this.InitializeChangedConnection(child);
		}
	}

	private InitializeRecursive(parent_instance: Instance) {
		this.maid_.GiveTask(
			parent_instance.DescendantAdded.Connect((child) => {
				this.InstanceAdded(child);
			}),
		);

		this.maid_.GiveTask(
			parent_instance.ChildRemoved.Connect((child) => {
				this.InstanceRemoved(child, parent_instance);
			}),
		);

		for (const descendant of parent_instance.GetDescendants()) {
			this.InitializeChangedConnection(descendant);
			this.InitializeChildRemovingConnection(descendant);
		}
	}
	private InitializeChangedConnection(instance: Instance) {
		const chanched_connection = (instance as Instance & ChangedSignal).Changed.Connect(() => {
			this.InstanceChanged(instance);
		});
		this.changed_connection_refferences_.set(instance, chanched_connection);
	}

	private InitializeChildRemovingConnection(instance: Instance) {
		const removing_connection = instance.ChildRemoved.Connect((child) => {
			this.InstanceRemoved(child, instance);
		});
		this.removing_connection_refferences_.set(instance, removing_connection);
	}

	private InstanceChanged(instance: Instance) {
		if (!this.active_) return;
		this.event_.Fire(instance, EChangeType.Changed);
		this.instance_changed_event_.Fire(instance, EChangeType.Changed);
	}

	private InstanceAdded(instance: Instance) {
		this.InitializeChangedConnection(instance);
		if (this.is_recursive_) this.InitializeChildRemovingConnection(instance);

		if (!this.active_) return;
		this.event_.Fire(instance, EChangeType.Added);
		this.instance_added_event_.Fire(instance, EChangeType.Added);
	}

	private InstanceRemoved(instance: Instance, parent: Instance) {
		this.changed_connection_refferences_.get(instance)?.Disconnect();
		this.removing_connection_refferences_.get(instance)?.Disconnect();

		this.changed_connection_refferences_.delete(instance);
		this.removing_connection_refferences_.delete(instance);

		if (!this.active_) return;
		this.event_.Fire(instance, EChangeType.Removed);
		this.instance_removed_event_.Fire(instance, EChangeType.Removed, parent);
	}

	Destroy() {
		this.maid_.Destroy();
	}
}
