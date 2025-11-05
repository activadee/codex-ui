export namespace agents {
	
	export class ErrorItemDTO {
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ErrorItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	    }
	}
	export class TodoItemDTO {
	    text: string;
	    completed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TodoItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.completed = source["completed"];
	    }
	}
	export class TodoListDTO {
	    items: TodoItemDTO[];
	
	    static createFrom(source: any = {}) {
	        return new TodoListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], TodoItemDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WebSearchDTO {
	    query: string;
	
	    static createFrom(source: any = {}) {
	        return new WebSearchDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	    }
	}
	export class ToolCallDTO {
	    server: string;
	    tool: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new ToolCallDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.server = source["server"];
	        this.tool = source["tool"];
	        this.status = source["status"];
	    }
	}
	export class FileChangeDTO {
	    path: string;
	    kind: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new FileChangeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.kind = source["kind"];
	        this.status = source["status"];
	    }
	}
	export class CommandExecutionDTO {
	    command: string;
	    aggregatedOutput: string;
	    exitCode?: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new CommandExecutionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.aggregatedOutput = source["aggregatedOutput"];
	        this.exitCode = source["exitCode"];
	        this.status = source["status"];
	    }
	}
	export class AgentItemDTO {
	    id: string;
	    type: string;
	    text?: string;
	    reasoning?: string;
	    command?: CommandExecutionDTO;
	    fileDiffs?: FileChangeDTO[];
	    toolCall?: ToolCallDTO;
	    webSearch?: WebSearchDTO;
	    todoList?: TodoListDTO;
	    error?: ErrorItemDTO;
	
	    static createFrom(source: any = {}) {
	        return new AgentItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.text = source["text"];
	        this.reasoning = source["reasoning"];
	        this.command = this.convertValues(source["command"], CommandExecutionDTO);
	        this.fileDiffs = this.convertValues(source["fileDiffs"], FileChangeDTO);
	        this.toolCall = this.convertValues(source["toolCall"], ToolCallDTO);
	        this.webSearch = this.convertValues(source["webSearch"], WebSearchDTO);
	        this.todoList = this.convertValues(source["todoList"], TodoListDTO);
	        this.error = this.convertValues(source["error"], ErrorItemDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CancelResponse {
	    threadId: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new CancelResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.status = source["status"];
	    }
	}
	
	export class InputSegmentDTO {
	    type: string;
	    text?: string;
	    imagePath?: string;
	
	    static createFrom(source: any = {}) {
	        return new InputSegmentDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.text = source["text"];
	        this.imagePath = source["imagePath"];
	    }
	}
	export class ConversationEntryDTO {
	    id: string;
	    role: string;
	    createdAt: string;
	    updatedAt?: string;
	    text?: string;
	    segments?: InputSegmentDTO[];
	    item?: AgentItemDTO;
	    tone?: string;
	    message?: string;
	    meta?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new ConversationEntryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.role = source["role"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.text = source["text"];
	        this.segments = this.convertValues(source["segments"], InputSegmentDTO);
	        this.item = this.convertValues(source["item"], AgentItemDTO);
	        this.tone = source["tone"];
	        this.message = source["message"];
	        this.meta = source["meta"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiffSummaryDTO {
	    added: number;
	    removed: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.removed = source["removed"];
	    }
	}
	
	
	export class FileDiffStatDTO {
	    path: string;
	    added: number;
	    removed: number;
	    status?: string;
	
	    static createFrom(source: any = {}) {
	        return new FileDiffStatDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.added = source["added"];
	        this.removed = source["removed"];
	        this.status = source["status"];
	    }
	}
	
	export class TurnOptionsDTO {
	    outputSchema?: number[];
	
	    static createFrom(source: any = {}) {
	        return new TurnOptionsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outputSchema = source["outputSchema"];
	    }
	}
	export class ThreadOptionsDTO {
	    model: string;
	    sandboxMode?: string;
	    workingDirectory?: string;
	    skipGitRepoCheck?: boolean;
	    reasoningLevel?: string;
	
	    static createFrom(source: any = {}) {
	        return new ThreadOptionsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.model = source["model"];
	        this.sandboxMode = source["sandboxMode"];
	        this.workingDirectory = source["workingDirectory"];
	        this.skipGitRepoCheck = source["skipGitRepoCheck"];
	        this.reasoningLevel = source["reasoningLevel"];
	    }
	}
	export class MessageRequest {
	    agentId?: string;
	    projectId?: number;
	    threadId?: number;
	    threadExternalId?: string;
	    input?: string;
	    segments?: InputSegmentDTO[];
	    threadOptions: ThreadOptionsDTO;
	    turnOptions?: TurnOptionsDTO;
	
	    static createFrom(source: any = {}) {
	        return new MessageRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.agentId = source["agentId"];
	        this.projectId = source["projectId"];
	        this.threadId = source["threadId"];
	        this.threadExternalId = source["threadExternalId"];
	        this.input = source["input"];
	        this.segments = this.convertValues(source["segments"], InputSegmentDTO);
	        this.threadOptions = this.convertValues(source["threadOptions"], ThreadOptionsDTO);
	        this.turnOptions = this.convertValues(source["turnOptions"], TurnOptionsDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StreamHandle {
	    streamId: string;
	    threadId: number;
	    threadExternalId?: string;
	
	    static createFrom(source: any = {}) {
	        return new StreamHandle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.streamId = source["streamId"];
	        this.threadId = source["threadId"];
	        this.threadExternalId = source["threadExternalId"];
	    }
	}
	export class ThreadDTO {
	    id: number;
	    projectId: number;
	    externalId?: string;
	    worktreePath?: string;
	    branchName?: string;
	    prUrl?: string;
	    title: string;
	    model: string;
	    sandboxMode: string;
	    reasoningLevel: string;
	    status: string;
	    createdAt: string;
	    updatedAt: string;
	    lastMessageAt?: string;
	    branch?: string;
	    pullRequestNumber?: number;
	    diffStat?: DiffSummaryDTO;
	
	    static createFrom(source: any = {}) {
	        return new ThreadDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.externalId = source["externalId"];
	        this.worktreePath = source["worktreePath"];
	        this.branchName = source["branchName"];
	        this.prUrl = source["prUrl"];
	        this.title = source["title"];
	        this.model = source["model"];
	        this.sandboxMode = source["sandboxMode"];
	        this.reasoningLevel = source["reasoningLevel"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.lastMessageAt = source["lastMessageAt"];
	        this.branch = source["branch"];
	        this.pullRequestNumber = source["pullRequestNumber"];
	        this.diffStat = this.convertValues(source["diffStat"], DiffSummaryDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	

}

export namespace projects {
	
	export class ProjectDTO {
	    id: number;
	    path: string;
	    displayName?: string;
	    tags?: string[];
	    lastOpenedAt?: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.displayName = source["displayName"];
	        this.tags = source["tags"];
	        this.lastOpenedAt = source["lastOpenedAt"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class RegisterProjectRequest {
	    path: string;
	    displayName?: string;
	    tags?: string[];
	
	    static createFrom(source: any = {}) {
	        return new RegisterProjectRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.displayName = source["displayName"];
	        this.tags = source["tags"];
	    }
	}

}

export namespace terminal {
	
	export class Handle {
	    threadId: number;
	
	    static createFrom(source: any = {}) {
	        return new Handle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	    }
	}

}

